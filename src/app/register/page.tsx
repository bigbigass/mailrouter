import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export default function RegisterPage() {
  return (
    <div className="auth-shell stack">
      <div className="stack">
        <h1>Register</h1>
        <p className="muted">Create an account before generating mailbox addresses.</p>
      </div>
      <AuthForm mode="register" />
      <p className="muted">
        Already registered? <Link href="/login">Log in</Link>
      </p>
    </div>
  );
}
