// Download a board as one image (PNG) or one-page PDF.
// Composes the tile canvases onto a single canvas, mirroring the on-screen layout.
// Used by the owner view page and the public shared page.
window.FluxionBoardExport = (function () {
    const PAD = 24;
    const TITLE_H = 48;
    const MAX_DIM = 8000;   // keep the output canvas inside browser limits
    const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

    function roundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function fitText(ctx, text, maxWidth) {
        if (ctx.measureText(text).width <= maxWidth) return text;
        let t = text;
        while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
        return t + '\u2026';
    }

    function slug(title) {
        return (title || 'board').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'board';
    }

    function compose(grid, title) {
        const gr = grid.getBoundingClientRect();
        const cssW = Math.ceil(gr.width + PAD * 2);
        const cssH = Math.ceil(gr.height + PAD * 2 + TITLE_H);
        const scale = Math.min(2, MAX_DIM / Math.max(cssW, cssH));

        const out = document.createElement('canvas');
        out.width = Math.round(cssW * scale);
        out.height = Math.round(cssH * scale);
        out.cssWidth = cssW;
        out.cssHeight = cssH;

        const ctx = out.getContext('2d');
        ctx.scale(scale, scale);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, cssW, cssH);

        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#10201A';
        ctx.font = '700 22px Inter, Arial, sans-serif';
        ctx.fillText(fitText(ctx, title || '', cssW - PAD * 2), PAD, PAD + 12);

        const top = PAD + TITLE_H;
        grid.querySelectorAll('.board-tile').forEach(tile => {
            const r = tile.getBoundingClientRect();
            const x = r.left - gr.left + PAD;
            const y = r.top - gr.top + top;

            roundedRect(ctx, x, y, r.width, r.height, 14);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.strokeStyle = '#E3E9E6';
            ctx.lineWidth = 1;
            ctx.stroke();

            const heading = tile.querySelector('h4');
            if (heading) {
                ctx.fillStyle = '#10201A';
                ctx.font = '700 16px Inter, Arial, sans-serif';
                ctx.fillText(fitText(ctx, heading.textContent, r.width - 40), x + 20, y + 28);
            }

            const chartCanvas = tile.querySelector('canvas');
            if (chartCanvas && chartCanvas.width && chartCanvas.height) {
                const cr = chartCanvas.getBoundingClientRect();
                ctx.drawImage(chartCanvas, cr.left - gr.left + PAD, cr.top - gr.top + top, cr.width, cr.height);
            }
        });
        return out;
    }

    function boardInfo() {
        const grid = document.getElementById('boardGrid');
        const el = document.getElementById('boardData');
        let title = 'board';
        try { title = JSON.parse(el.textContent).title || 'board'; } catch (e) { /* keep default */ }
        return { grid: grid, title: title };
    }

    function save(blob, name) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function downloadPng() {
        const info = boardInfo();
        if (!info.grid) return;
        compose(info.grid, info.title).toBlob(blob => {
            if (!blob) {
                alert('Could not create the image');
                return;
            }
            save(blob, slug(info.title) + '.png');
        }, 'image/png');
    }

    function loadJsPdf() {
        return new Promise((resolve, reject) => {
            if (window.jspdf) return resolve(window.jspdf);
            const script = document.createElement('script');
            script.src = JSPDF_URL;
            script.onload = () => resolve(window.jspdf);
            script.onerror = () => reject(new Error('Could not load the PDF library'));
            document.head.appendChild(script);
        });
    }

    async function downloadPdf() {
        const info = boardInfo();
        if (!info.grid) return;
        try {
            const lib = await loadJsPdf();
            const canvas = compose(info.grid, info.title);
            const w = canvas.cssWidth;
            const h = canvas.cssHeight;
            const pdf = new lib.jsPDF({
                orientation: w > h ? 'landscape' : 'portrait',
                unit: 'px',
                format: [w, h],
                hotfixes: ['px_scaling']
            });
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h);
            pdf.save(slug(info.title) + '.pdf');
        } catch (error) {
            console.error('Error creating PDF:', error);
            alert('Could not create the PDF: ' + error.message);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const pngBtn = document.getElementById('downloadBoardPngBtn');
        const pdfBtn = document.getElementById('downloadBoardPdfBtn');
        if (pngBtn) pngBtn.addEventListener('click', downloadPng);
        if (pdfBtn) pdfBtn.addEventListener('click', downloadPdf);
    });

    return { compose: compose, downloadPng: downloadPng, downloadPdf: downloadPdf };
})();