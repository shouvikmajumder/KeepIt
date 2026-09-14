"""Read-only detection preview. Prints aggregate outcomes, never bank details."""
from collections import Counter
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.classification import classify
from app.detection import local_streams
from app.plaid_client import plaid, decrypt, PlaidError
from app.postgres import transaction


def main():
    counts, reasons = Counter(), Counter()
    with transaction() as db:
        db.execute("set transaction read only")
        connections = db.execute("select * from keepit_private.connections").fetchall()
        for connection in connections:
            rows = db.execute("select * from keepit_private.transactions where connection_id=%s",
                              (connection["id"],)).fetchall()
            by_id = {row["transaction_id"]: row for row in rows}
            claimed = set()
            try:
                streams = plaid("/transactions/recurring/get", access_token=decrypt(connection["token_ciphertext"]),
                    options={"personal_finance_category_version": "v2"})["outflow_streams"]
            except PlaidError as exc:
                print("Provider unavailable:", exc.code)
                streams = []
            for stream in streams:
                stream["_history"] = [by_id[tid] for tid in set(stream.get("transaction_ids") or [])
                    if tid in by_id and by_id[tid]["account_id"] == stream.get("account_id")]
                claimed.update(row["transaction_id"] for row in stream["_history"])
            streams.extend(stream for stream in local_streams(rows) if not claimed.intersection(stream["transaction_ids"]))
            for stream in streams:
                result = classify(stream)
                counts[(stream.get("_source", "plaid"), result["payment_type"], result["confidence"])] += 1
                reasons.update(result["reason_codes"])
    print("Connections evaluated:", len(connections))
    for key, count in sorted(counts.items()):
        print(" / ".join(key) + ":", count)
    print("Reason counts:", dict(sorted(reasons.items())))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Preview failed ({type(exc).__name__}); no changes were made.", file=sys.stderr)
        raise SystemExit(1)
