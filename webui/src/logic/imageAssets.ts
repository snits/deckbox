// ABOUTME: Builds transient browser image sources for files selected beside a
// ABOUTME: deck manifest, keeping local asset paths out of the deck model.

export type ImageSourceMap = Record<string, string>;

type RelativePathFile = File & { webkitRelativePath?: string };

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

function filePath(file: File): string {
  return normalizeAssetPath((file as RelativePathFile).webkitRelativePath || file.name);
}

export function normalizeAssetPath(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else parts.push(part);
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function relativePath(manifestPath: string, assetPath: string): string {
  const manifestParts = manifestPath.split('/');
  manifestParts.pop();
  const assetParts = assetPath.split('/');
  let common = 0;
  while (common < manifestParts.length && common < assetParts.length && manifestParts[common] === assetParts[common]) {
    common += 1;
  }
  return [
    ...manifestParts.slice(common).map(() => '..'),
    ...assetParts.slice(common),
  ].join('/');
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSION.test(filePath(file));
}

export function findManifestFiles(files: readonly File[]): File[] {
  return files.filter((file) => /\.(?:yaml|yml)$/i.test(filePath(file)));
}

export function createImageSources(manifest: File, files: readonly File[]): ImageSourceMap {
  const manifestPath = filePath(manifest);
  const sources: ImageSourceMap = {};

  for (const file of files) {
    const assetPath = filePath(file);
    if (file === manifest || assetPath === manifestPath || !isImageFile(file)) continue;
    const key = relativePath(manifestPath, assetPath);
    if (!key || key in sources) continue;
    sources[key] = URL.createObjectURL(file);
  }

  return sources;
}
