// Synthetic PDF builder: deterministic offsets, no real resumes or third-party assets.
export function pdfObjects(objects: string[], trailer = ''): Uint8Array {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}
export const stream = (content: string) =>
  `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`;
export function pdfFixture(
  pages: string[] = ['Synthetic PDF'],
  options: {
    unicode?: boolean;
    image?: boolean;
    encrypted?: boolean;
    externalAction?: boolean;
    cmap?: string;
  } = {},
): Uint8Array {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${options.externalAction ? '/OpenAction << /S /JavaScript /JS (throw new Error\\(SECRET\\)) >> /AA << /WC << /S /URI /URI (https://example.invalid/private) >> >>' : ''} >>`,
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${6 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    options.unicode || options.cmap
      ? `<< /Type /Font /Subtype /Type0 /BaseFont /Synthetic /Encoding /${options.cmap ?? 'Identity-H'} /DescendantFonts [4 0 R] /ToUnicode 5 0 R >>`
      : '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Synthetic /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 600 >>',
    stream(
      '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Synthetic def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange 3 beginbfchar <0001> <D83DDE00> <0002> <00E9> <0003> <0052> endbfchar endcmap CMapName currentdict /CMap defineresource pop end end',
    ),
  ];
  for (const [index, text] of pages.entries()) {
    const content = options.image
      ? 'q 10 0 0 10 72 700 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID abc EI Q'
      : text
        ? `BT /F1 12 Tf 72 720 Td ${options.unicode ? '<000100020003>' : `(${text.replace(/[\\()]/g, '\\$&')})`} Tj ET`
        : '';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${Math.max(612, text.length * 10 + 200)} 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${7 + index * 2} 0 R >>`,
      stream(content),
    );
  }
  if (options.encrypted) {
    objects.push(
      '<< /Filter /Standard /V 1 /R 2 /Length 40 /O <' +
        '00'.repeat(32) +
        '> /U <' +
        '00'.repeat(32) +
        '> /P -4 >>',
    );
    return pdfObjects(
      objects,
      `/Encrypt ${objects.length} 0 R /ID [<${'00'.repeat(16)}> <${'00'.repeat(16)}>]`,
    );
  }
  return pdfObjects(objects);
}
export const pdfInput = (bytes = pdfFixture()) => ({
  bytes,
  fileName: 'synthetic.pdf',
  mediaType: 'application/pdf',
});
