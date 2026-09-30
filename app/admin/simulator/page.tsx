import Link from "next/link";

export default function SimulatorHome() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Simulator</h1>
      <div className="flex gap-4 text-sm">
        <Link href="/admin/simulator/scenarios" className="underline">
          Scenarios
        </Link>
        <Link href="/admin/simulator/executions" className="underline">
          Execution history
        </Link>
      </div>
    </div>
  );
}
