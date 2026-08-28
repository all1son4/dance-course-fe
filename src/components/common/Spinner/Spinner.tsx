import { Ring } from "./Spinner.styles";

/** Decorative: the text next to it carries the status for assistive tech. */
export default function Spinner({ className }: { className?: string }) {
  return <Ring aria-hidden className={className} />;
}
