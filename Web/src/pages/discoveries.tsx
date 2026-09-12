import { useState } from "react";
import { Link } from "react-router";
import { Loading, Notice, PageHeading } from "../components/ui";
import { errorMessage } from "../lib/api";
import { listCandidates, reviewCandidate, type Candidate } from "../lib/banks";
import { dateLabel, money } from "../lib/dates";
import { listSubscriptions, type Subscription } from "../lib/subscriptions";
import { useResource } from "../lib/use-resource";

async function loadDiscoveries() {
  const [candidates, subscriptions] = await Promise.all([listCandidates(), listSubscriptions()]);
  return { candidates, manual: subscriptions.filter((item) => item.source === "manual") };
}

function DiscoveryCard({ item, manual, onReviewed }: { item: Candidate; manual: Subscription[]; onReviewed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchId, setMatchId] = useState("");
  async function review(action: "confirm" | "ignore" | "match") {
    setBusy(true);
    setError(null);
    try {
      if (action === "match" && !matchId) throw new Error("Choose a manual subscription to match.");
      await reviewCandidate(item.id, action, matchId || undefined);
      await onReviewed();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const observation = item.observation;
  return (
    <article className="discovery-card">
      <div className="discovery-summary">
        <span className="source-label">Needs review</span>
        <h2>{observation.name}</h2>
        <p>{money(observation.cost)} · {observation.billing_interval || "Unknown interval"} · {observation.account_label}</p>
        <p className="muted">Next estimate: {observation.next_renewal_date ? dateLabel(observation.next_renewal_date) : "Unavailable"}</p>
      </div>
      <Notice error={error} />
      <div className="discovery-actions">
        <button className="button primary" disabled={busy || !observation.eligible} onClick={() => review("confirm")}>Track subscription</button>
        <button className="button secondary" disabled={busy} onClick={() => review("ignore")}>Ignore</button>
      </div>
      {manual.length > 0 && (
        <div className="match-row">
          <label>
            Already tracking this?
            <select value={matchId} onChange={(event) => setMatchId(event.target.value)} disabled={busy}>
              <option value="">Choose a manual subscription</option>
              {manual.map((subscription) => <option key={subscription.id} value={subscription.id}>{subscription.name}</option>)}
            </select>
          </label>
          <button className="text-button" disabled={busy || !matchId} onClick={() => review("match")}>Match existing</button>
        </div>
      )}
      {!observation.eligible && <p className="muted">Not ready to track: {observation.reason}</p>}
    </article>
  );
}

export function Discoveries() {
  const { data, error, loading, reload } = useResource(loadDiscoveries);
  const pending = data?.candidates.filter((item) => item.decision === "pending") || [];
  return (
    <>
      <PageHeading eyebrow="Plaid discoveries" title="Review subscriptions">
        <Link className="button secondary" to="/connections">Manage connections</Link>
      </PageHeading>
      <p className="page-intro">Plaid can recognize recurring payments, including bills. Confirm only the services you want KeepIt to track.</p>
      <Notice error={error} retry={reload} />
      {loading ? <Loading /> : pending.length ? (
        <section className="discovery-list">
          {pending.map((item) => <DiscoveryCard key={item.id} item={item} manual={data?.manual || []} onReviewed={reload} />)}
        </section>
      ) : (
        <section className="panel empty">
          <h2>Nothing to review right now</h2>
          <p className="muted">Connect an account or check for updates to discover recurring payments.</p>
          <Link className="button primary" to="/connections">Manage connections</Link>
        </section>
      )}
    </>
  );
}
