// ABOUTME: File System Access API wrapper for saving deck YAML to a user-chosen
// ABOUTME: file, with a capability probe; callers fall back to download when absent.

export function canPickFiles(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

async function writeFile(handle: FileSystemFileHandle, text: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}

export async function pickAndWrite(
  suggestedName: string,
  text: string,
): Promise<FileSystemFileHandle | null> {
  let handle: FileSystemFileHandle;
  try {
    handle = await window.showSaveFilePicker({
      suggestedName,
      types: [{ description: 'YAML', accept: { 'text/yaml': ['.yaml', '.yml'] } }],
    });
  } catch (err) {
    // The user dismissed the picker — not an error worth surfacing.
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  await writeFile(handle, text);
  return handle;
}

export async function writeExisting(
  handle: FileSystemFileHandle,
  text: string,
): Promise<boolean> {
  if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
    if ((await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return false;
  }
  await writeFile(handle, text);
  return true;
}
