type MessageListItem = {
  id: string;
  fromAddress: string;
  subject: string;
  textBody: string;
  receivedAt: Date;
  verificationCodes: Array<{ id: string; code: string; confidence: number }>;
};

export function MessageList({ messages }: { messages: MessageListItem[] }) {
  if (messages.length === 0) {
    return <p className="muted">No messages received yet.</p>;
  }

  return (
    <div className="panel">
      {messages.map((message) => {
        const code = message.verificationCodes[0];
        const summary = message.textBody.slice(0, 180);

        return (
          <div className="row" key={message.id}>
            <div className="row-main">
              <strong className="row-title">{message.subject || "(No subject)"}</strong>
              <div className="meta">
                From {message.fromAddress}. {new Date(message.receivedAt).toLocaleString()}
              </div>
              <div className="summary">{summary}</div>
            </div>
            {code ? <span className="code">{code.code}</span> : <span className="muted">No code</span>}
          </div>
        );
      })}
    </div>
  );
}
