"use client";
import { useState, type FormEvent } from "react";
import {
  priorities,
  ticketTypes,
  ticketStatuses,
  nextTicketStatuses,
  statusLabel,
  workspaceActionSchema,
} from "@/lib/collaboration";
import { usePollingResource } from "./collaboration-ui";
import { api, Empty, ErrorState, Skeleton } from "./ui";

type Entry = {
  id: string;
  author_id: string;
  created_by: string;
  created_at: string;
  body: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  status: (typeof ticketStatuses)[number];
  assignee_id: string | null;
};
type Person = { id: string; name: string };
export function Activity({
  kind,
  url,
  viewer,
  people,
  readonly,
}: {
  kind: "updates" | "tickets";
  url: string;
  viewer: string;
  people: Person[];
  readonly: boolean;
}) {
  const list = usePollingResource<{ data: Entry[] }>(
    url + "?resource=" + kind,
    15000,
  );
  const [edit, setEdit] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const tickets = kind === "tickets";
  async function mutate(input: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(url, workspaceActionSchema.parse(input));
      list.refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const input = tickets
      ? { ...values, action: "ticket", assignee_id: values.assignee_id || null }
      : { action: "post_update", body: values.body };
    if (await mutate({ ...input, id: crypto.randomUUID() })) form.reset();
  }
  const rows =
    list.data?.data.filter((row) =>
      Object.entries(filters).every(
        ([key, value]) =>
          !value || String(row[key as keyof Entry] ?? "unassigned") === value,
      ),
    ) ?? [];
  const options = (values: readonly string[]) =>
    values.map((value) => (
      <option key={value} value={value}>
        {statusLabel(value)}
      </option>
    ));
  const peopleOptions = people.map((person) => (
    <option key={person.id} value={person.id}>
      {person.name}
    </option>
  ));
  return (
    <section className="content-panel dashboard-activity">
      <h2>{tickets ? "Tickets" : "Work updates"}</h2>
      <form onSubmit={submit}>
        <fieldset disabled={busy || readonly}>
          {tickets ? (
            <>
              <label>
                Title
                <input required name="title" maxLength={120} />
              </label>
              <label>
                Description
                <textarea required name="description" maxLength={4000} />
              </label>
              <label>
                Type<select name="type">{options(ticketTypes)}</select>
              </label>
              <label>
                Priority
                <select name="priority" defaultValue="medium">
                  {options(priorities)}
                </select>
              </label>
              <label>
                Assignee
                <select name="assignee_id">
                  <option value="">Unassigned</option>
                  {peopleOptions}
                </select>
              </label>
            </>
          ) : (
            <label>
              Completed work
              <textarea name="body" required maxLength={4000} />
            </label>
          )}
          <button className="btn">
            {tickets ? "Raise ticket" : "Post update"}
          </button>
        </fieldset>
      </form>
      {error && <ErrorState message={error} />}
      {tickets && (
        <div className="dashboard-filters">
          {Object.entries({
            type: ticketTypes,
            status: ticketStatuses,
            priority: priorities,
            assignee_id: [],
          }).map(([key, values]) => (
            <label key={key}>
              Filter {key === "assignee_id" ? "assignee" : key}
              <select
                value={filters[key] ?? ""}
                onChange={(e) =>
                  setFilters({ ...filters, [key]: e.target.value })
                }
              >
                <option value="">Any</option>
                {key === "assignee_id" ? (
                  <>
                    <option value="unassigned">Unassigned</option>
                    {peopleOptions}
                  </>
                ) : (
                  options(values)
                )}
              </select>
            </label>
          ))}
        </div>
      )}
      {list.loading ? (
        <Skeleton />
      ) : list.error ? (
        <ErrorState message={list.error} retry={list.refresh} />
      ) : !rows.length ? (
        <Empty
          title={"No " + kind + " yet"}
          description="New entries appear here."
        />
      ) : (
        rows.map((row) => (
          <article className="record-card" key={row.id}>
            <small>
              {people.find(
                (p) => p.id === (tickets ? row.created_by : row.author_id),
              )?.name ?? "Former member"}{" "}
              · {new Date(row.created_at).toLocaleString()}
            </small>
            {tickets ? (
              <>
                <h3>{row.title}</h3>
                <p className="preserve-lines">{row.description}</p>
                <p>
                  {row.type} · {row.priority} priority ·{" "}
                  {people.find((p) => p.id === row.assignee_id)?.name ??
                    "Unassigned"}
                </p>
                <label>
                  Status
                  <select
                    aria-label={"Status of " + row.title}
                    value={row.status}
                    disabled={readonly || busy}
                    onChange={(e) =>
                      void mutate({
                        action: "ticket_status",
                        id: row.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {options([row.status, ...nextTicketStatuses[row.status]])}
                  </select>
                </label>
              </>
            ) : edit === row.id ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const body = new FormData(e.currentTarget).get("body");
                  if (await mutate({ action: "edit_update", id: row.id, body }))
                    setEdit(null);
                }}
              >
                <textarea
                  aria-label="Edit completed work"
                  required
                  maxLength={4000}
                  name="body"
                  defaultValue={row.body}
                />
                <button disabled={busy || readonly}>Save</button>
                <button type="button" onClick={() => setEdit(null)}>
                  Cancel
                </button>
              </form>
            ) : (
              <>
                <p className="preserve-lines">{row.body}</p>
                {!readonly && row.author_id === viewer && (
                  <>
                    <button onClick={() => setEdit(row.id)}>Edit</button>{" "}
                    <button
                      disabled={busy}
                      onClick={() =>
                        void mutate({ action: "delete_update", id: row.id })
                      }
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </article>
        ))
      )}
    </section>
  );
}
