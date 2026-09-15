declare module "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js" {
  const pdfjs: {
    getDocument(input: { data: Uint8Array }): { promise: Promise<unknown> };
  };
  export default pdfjs;
}
