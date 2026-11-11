import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p className="muted">This page does not exist, or you do not have access to it.</p>
      <p><Link href="/">Go to your organisations</Link></p>
    </>
  );
}
