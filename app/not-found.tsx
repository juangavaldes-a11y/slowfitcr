import ErrorRecovery from "./error-recovery";

export default function NotFound() {
  return <ErrorRecovery kind="not-found" />;
}