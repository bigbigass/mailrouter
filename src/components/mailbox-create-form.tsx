"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function MailboxCreateForm({ domain }: { domain: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/mailboxes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ localPart: String(formData.get("localPart") ?? "") }),
    });

    setSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Mailbox creation failed.");
      return;
    }

    form.reset();
    router.refresh();
  }

  return (
    <form className="panel stack" onSubmit={submit}>
      <div className="field">
        <label htmlFor="localPart">New address</label>
        <div className="field-row">
          <input id="localPart" name="localPart" placeholder="name" required />
          <span className="field-suffix">@{domain}</span>
        </div>
      </div>
      {error ? <p className="meta">{error}</p> : null}
      <button className="button" type="submit" disabled={submitting}>
        {submitting ? "Creating" : "Create address"}
      </button>
    </form>
  );
}
