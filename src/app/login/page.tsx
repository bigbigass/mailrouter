import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <div className="auth-shell stack">
      <div className="stack">
        <h1>Log in</h1>
        <p className="muted">Access your routed verification mailboxes.</p>
      </div>
      <AuthForm mode="login" />
      <p className="muted">
        Need an account? <Link href="/register">Register</Link>
      </p>
    </div>
  );
}
