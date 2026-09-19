declare module "html2pdf.js" {
  type Html2PdfOptions = {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: Record<string, unknown>;
    enableLinks?: boolean;
  };
  interface Worker {
    set(opt: Html2PdfOptions): Worker;
    from(src: HTMLElement | string): Worker;
    save(filename?: string): Promise<void>;
    toPdf(): Worker;
    output(type?: string, options?: unknown): Promise<unknown>;
  }
  export default function html2pdf(): Worker;
}
