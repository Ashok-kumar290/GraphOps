export async function api(path: string, body?: unknown) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
  const response = await fetch(
    path,
    body === undefined
      ? { signal: controller.signal }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-GraphOps": "1" },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
  );
  let data;
  try { data = await response.json(); }
  catch {throw Object.assign(new Error(`Server returned an unreadable response (HTTP ${response.status}). Refresh the workspace before retrying.`),{status:response.status});}
  if (!response.ok)
    throw Object.assign(new Error(data?.error || "Request failed"), {
      status: response.status,
    });
  return data;
  } catch (error: any) {
    if (error.name === "AbortError" || error instanceof TypeError) {
      throw new Error((error.name === "AbortError" ? "The request timed out." : "Cannot reach the workspace.") + (body === undefined ? " Check the server connection and retry." : " The command may have been accepted; refresh the workspace or run history before submitting it again."));
    }
    throw error;
  } finally { clearTimeout(timer); }
}
