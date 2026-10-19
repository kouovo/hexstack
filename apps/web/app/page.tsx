import { Account } from "./account";

export default function Home() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="mb-6 text-2xl font-semibold">Todos</h1>
      <Account />
    </main>
  );
}
