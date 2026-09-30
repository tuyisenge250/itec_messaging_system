import Link from "next/link";
import { Button } from "./_components/ui/Button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">SMS Gateway</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-foreground-muted">
          A Rwanda-focused SMS Gateway platform — organizations, Sender ID compliance, SMS credit wallet, and messaging, backed by a real API.
        </p>
      </div>
      <div className="flex gap-3">
        <Link href="/login">
          <Button>Log in</Button>
        </Link>
        <Link href="/register">
          <Button variant="outline">Register</Button>
        </Link>
      </div>
    </div>
  );
}
