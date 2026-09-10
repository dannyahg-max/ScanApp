
document.addEventListener('DOMContentLoaded', () => {
    const MAX_PAGES = 20;
    let stream = null;
    let tempImageBase64 = null;
    let currentFacingMode = "environment";

    const DOM = {
        homeState: document.getElementById('home-state'),
        camSection: document.getElementById('camera-section'),
        galSection: document.getElementById('gallery-section'),
        footer: document.getElementById('action-footer'),
        video: document.getElementById('video-feed'),
        preview: document.getElementById('photo-preview'),
        guide: document.getElementById('scanner-guide'),
        canvas: document.getElementById('canvas'),
        ctx: document.getElementById('canvas').getContext('2d'),
        gallery: document.getElementById('gallery'),
        fileUpload: document.getElementById('file-upload'),
        loading: document.getElementById('loading-overlay'),
        settingsModal: new bootstrap.Modal(document.getElementById('settingsModal'))
    };

    // --- 1. LÓGICA DE CÁMARA (ON DEMAND) ---
    document.getElementById('btn-open-camera').addEventListener('click', async () => {
        DOM.camSection.classList.remove('d-none');
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            DOM.video.srcObject = stream;
        } catch (err) {
            alert("No se pudo iniciar la cámara. Revisa los permisos.");
            closeCamera();
        }
    });

    function closeCamera() {
        if (stream) stream.getTracks().forEach(track => track.stop());
        DOM.camSection.classList.add('d-none');
        resetCameraUI();
    }

    document.getElementById('btn-close-camera').addEventListener('click', closeCamera);

    document.getElementById('btn-switch').addEventListener('click', () => {
        closeCamera();
        currentFacingMode = currentFacingMode === "environment" ? "user" : "environment";
        document.getElementById('btn-open-camera').click();
    });

    // --- 2. CAPTURA DE FOTO MATEMÁTICA ---
    document.getElementById('btn-capture').addEventListener('click', () => {
        if (getGalleryCount() >= MAX_PAGES) return alert("Límite de páginas alcanzado.");
        if (!DOM.video.videoWidth) return;

        const vw = DOM.video.videoWidth; const vh = DOM.video.videoHeight;
        const cw = DOM.video.clientWidth; const ch = DOM.video.clientHeight;
        const scale = Math.max(cw / vw, ch / vh);
        
        const offsetX = ((vw * scale) - cw) / 2;
        const offsetY = ((vh * scale) - ch) / 2;

        const guideRect = DOM.guide.getBoundingClientRect();
        const containerRect = DOM.video.parentElement.getBoundingClientRect();
        
        const cropX = ((guideRect.left - containerRect.left) + offsetX) / scale;
        const cropY = ((guideRect.top - containerRect.top) + offsetY) / scale;
        const cropW = guideRect.width / scale;
        const cropH = guideRect.height / scale;

        DOM.canvas.width = cropW; DOM.canvas.height = cropH;
        DOM.ctx.drawImage(DOM.video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
        
        tempImageBase64 = DOM.canvas.toDataURL('image/jpeg', 0.9);

        DOM.preview.src = tempImageBase64;
        DOM.preview.classList.remove('d-none');
        DOM.guide.style.opacity = '0';
        document.getElementById('controls-capture').classList.add('d-none');
        document.getElementById('controls-review').classList.remove('d-none');
    });

    document.getElementById('btn-retake').addEventListener('click', resetCameraUI);
    
    function resetCameraUI() {
        tempImageBase64 = null;
        DOM.preview.classList.add('d-none');
        DOM.guide.style.opacity = '1';
        document.getElementById('controls-review').classList.add('d-none');
        document.getElementById('controls-capture').classList.remove('d-none');
    }

    document.getElementById('btn-accept').addEventListener('click', () => {
        addPage(tempImageBase64);
        closeCamera(); // Regresa al menú tras aceptar
    });

    // --- 3. IMPORTACIÓN (PDF/Fotos) ---
    DOM.fileUpload.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files.length) return;
        DOM.loading.style.display = 'flex';

        for (let file of files) {
            if (getGalleryCount() >= MAX_PAGES) break;
            
            if (file.type.includes('image')) {
                const reader = new FileReader();
                await new Promise(res => { reader.onload = (evt) => { addPage(evt.target.result); res(); }; reader.readAsDataURL(file); });
            } else if (file.type === 'application/pdf') {
                const arr = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(arr).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    if (getGalleryCount() >= MAX_PAGES) break;
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    DOM.canvas.width = viewport.width; DOM.canvas.height = viewport.height;
                    await page.render({ canvasContext: DOM.ctx, viewport }).promise;
                    addPage(DOM.canvas.toDataURL('image/jpeg', 0.9));
                }
            }
        }
        DOM.loading.style.display = 'none';
        DOM.fileUpload.value = '';
    });

    // --- 4. GALERÍA ---
    new Sortable(DOM.gallery, { animation: 150, delay: 150, delayOnTouchOnly: true, onEnd: updateUI });

    function getGalleryCount() { return DOM.gallery.querySelectorAll('.gallery-item').length; }

    function addPage(src) {
        const col = document.createElement('div');
        col.className = 'col-6 col-sm-4';
        col.innerHTML = `
            <div class="gallery-item">
                <button class="btn-delete"><i class="bi bi-x-lg"></i></button>
                <img src="${src}" class="scanned-img"><div class="page-badge"></div>
            </div>`;
        col.querySelector('.btn-delete').addEventListener('click', () => { col.remove(); updateUI(); });
        DOM.gallery.appendChild(col);
        updateUI();
    }

    function updateUI() {
        const count = getGalleryCount();
        DOM.galSection.classList.toggle('d-none', count === 0);
        DOM.footer.classList.toggle('d-none', count === 0);
        document.getElementById('page-counter').textContent = `${count} / ${MAX_PAGES}`;
        DOM.gallery.querySelectorAll('.gallery-item').forEach((item, i) => item.querySelector('.page-badge').textContent = `Pág ${i + 1}`);
    }

    // --- 5. GENERAR PDF (CON NOMBRE DINÁMICO Y FORMATO) ---
    document.getElementById('btn-finish').addEventListener('click', () => DOM.settingsModal.show());

    document.getElementById('btn-generate-pdf').addEventListener('click', () => {
        const btnGen = document.getElementById('btn-generate-pdf');
        btnGen.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Generando...';
        
        // Formato (A4 o Letter) y Nombre de archivo
        const formatStr = document.getElementById('doc-format').value; // 'a4' o 'letter'
        let filename = document.getElementById('pdf-filename').value.trim();
        if (!filename) filename = "Documento_Escaneado";
        
        const margin = parseInt(document.querySelector('input[name="marginOptions"]:checked').value);

        setTimeout(() => {
            const images = Array.from(DOM.gallery.querySelectorAll('.scanned-img')).map(img => img.src);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('p', 'mm', formatStr); 
            
            const pdfW = doc.internal.pageSize.getWidth();
            const pdfH = doc.internal.pageSize.getHeight();

            images.forEach((imgData, index) => {
                if (index > 0) doc.addPage();
                const imgProps = doc.getImageProperties(imgData);
                
                const availW = pdfW - (margin * 2); const availH = pdfH - (margin * 2);
                let finalW = availW; let finalH = (imgProps.height * availW) / imgProps.width;

                if (finalH > availH) { finalH = availH; finalW = (imgProps.width * availH) / imgProps.height; }

                const x = margin + ((availW - finalW) / 2); const y = margin + ((availH - finalH) / 2);
                doc.addImage(imgData, 'JPEG', x, y, finalW, finalH);
            });

            doc.save(`${filename}.pdf`);
            btnGen.innerHTML = '<i class="bi bi-download me-2"></i> Generar y Descargar';
            DOM.settingsModal.hide();
        }, 200);
    });
});
