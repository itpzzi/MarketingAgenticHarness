import type { Block } from './types';

export function artifactFile(block: Block, index: number): { name: string; content: string; type: string } {
  const title = block.title || `artefato-${index + 1}`;
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  if (block.type === 'table' && block.columns) {
    const rows = [block.columns, ...(block.rows || []).map((row) => (block.columns as string[]).map((column) => row[column] ?? ''))];
    const content = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    return { name: `${safeTitle}.csv`, content, type: 'text/csv;charset=utf-8' };
  }
  return { name: `${safeTitle}.md`, content: `# ${title}\n\n${block.content || ''}`, type: 'text/markdown;charset=utf-8' };
}

export function downloadArtifact(block: Block, index: number): void {
  const file = artifactFile(block, index);
  const url = URL.createObjectURL(new Blob([file.content], { type: file.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}
