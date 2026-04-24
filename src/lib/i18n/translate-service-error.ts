import { SERVICE_ERROR_MESSAGE_KEY } from "@/i18n/message-key-map";

type ErrorsT = (
  key: string,
  values?: Record<string, string | number | Date>,
) => string;

const CHECKPOINT_STATUS_PREFIX = /^Checkpoint request failed with status (\d+)\.$/;

function errorsLeaf(fullKey: string): string {
  return fullKey.startsWith("errors.") ? fullKey.slice("errors.".length) : fullKey;
}

export function translateServiceError(message: string, tErrors: ErrorsT): string {
  const mapped = SERVICE_ERROR_MESSAGE_KEY[message];
  if (mapped) {
    return tErrors(errorsLeaf(mapped));
  }

  const statusMatch = message.match(CHECKPOINT_STATUS_PREFIX);
  if (statusMatch) {
    return tErrors("checkpointsRequestFailed", { status: statusMatch[1] });
  }

  return tErrors("fallbackUnknown", { message });
}
