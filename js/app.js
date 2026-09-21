/**
 * Scanner PDF Pro - Lógica Principal Integrada
 * Arquitectura modular ES6 a prueba de fallos
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const ScannerApp = {
        // --- CONSTANTES Y ESTADO ---
        MAX_PAGES: 20,
        stream: null,
        tempImageBase64: null,
        currentFacingMode: 'environment',

        // --- REFERENCIAS AL DOM ---
        DOM: {
            homeState: document.getElementById('home-state'),
            camSection: document.getElementById('camera-section'),
            galSection: document.getElementById('gallery-section'),
            footer: document.getElementById('action-footer'),
            
            video: document.getElementById('video-feed'),
            preview: document.getElementById('photo-preview'),
            guide: document.getElementById('scanner-guide'),
            canvas: document.getElementById('canvas'),
            ctx: document.getElementById('canvas').getContext('2d'),
            controlsCapture: document.getElementById('controls-capture'),
            controlsReview: document.getElementById('controls-review'),
            
            gallery: document.getElementById('gallery'),
            fileUpload: document.getElementById('file-upload'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            pageCounter: document.getElementById('page-counter'),
            
            settingsModal: new bootstrap.Modal(document.getElementById('settingsModal')),
            formatSelect: document.getElementById('doc-format'),
            filenameInput: document.getElementById('pdf-filename'),
            btnGeneratePdf: document.getElementById('btn-generate-pdf')
        },

        // --- 1. INICIALIZACIÓN DE EVENTOS ---
        init() {
            this.bindEvents();
            this.initSortable();
        },

        bindEvents() {
            // Eventos de Cámara (Home)
            document.getElementById('btn-open-camera').addEventListener('click', () => this.openCamera());
            document.getElementById('btn-close-camera').addEventListener('click', () => this.closeCamera());
            document.getElementById('btn-switch').addEventListener('click', () => this.switchCamera());
            document.getElementById('btn-capture').addEventListener('click', () => this.capturePhoto());
            document.getElementById('btn-retake').addEventListener('click', () => this.resetCameraUI());
            document.getElementById('btn-accept').addEventListener('click', () => this.acceptPhoto());

            // Eventos de Importación (Home)
            const btnImportAlternative = document.getElementById('btn-import');
            if(btnImportAlternative) {
                btnImportAlternative.addEventListener('click', () => this.DOM.fileUpload.click());
            }
            this.DOM.fileUpload.addEventListener('change', (e) => this.handleFileUpload(e));

            // NUEVO: Eventos para añadir más páginas desde la Galería
            const btnAddScan = document.getElementById('btn-add-scan');
            if(btnAddScan) btnAddScan.addEventListener('click', () => this.openCamera());

            const btnAddImport = document.getElementById('btn-add-import');
            if(btnAddImport) btnAddImport.addEventListener('click', () => this.DOM.fileUpload.click());

            // Eventos de Generación PDF
            document.getElementById('btn-finish').addEventListener('click', () => this.DOM.settingsModal.show());
            this.DOM.btnGeneratePdf.addEventListener('click', () => this.generatePDF());
        },

        // --- 2. GESTIÓN PROFESIONAL DE CÁMARA ---
        async openCamera() {
            // NUEVO: Ocultamos TODAS las vistas previas (Home y Galería) para que el escáner esté limpio
            this.DOM.homeState.classList.add('d-none');
            this.DOM.galSection.classList.add('d-none');
            this.DOM.footer.classList.add('d-none');
            
            this.DOM.camSection.classList.remove('d-none');
            
            let constraints = {
                video: { facingMode: this.currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            };

            try {
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err1) {
                console.warn("Fallo con alta resolución, intentando configuración básica...", err1);
                try {
                    constraints = { video: { facingMode: this.currentFacingMode }, audio: false };
                    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (err2) {
                    console.warn("Fallo con configuración básica, encendiendo cualquier cámara...", err2);
                    try {
                        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    } catch (err3) {
                        alert(`Error al abrir la cámara:\n${err3.message}\n\nAsegúrate de otorgar permisos al navegador.`);
                        this.closeCamera();
                        return; 
                    }
                }
            }

            if (this.stream) {
                this.DOM.video.srcObject = this.stream;
                this.DOM.video.onloadedmetadata = () => {
                    this.DOM.video.play().catch(e => console.error("Error al forzar autoplay:", e));
                };
            }
        },

        closeCamera() {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            this.DOM.camSection.classList.add('d-none');
            this.resetCameraUI();
            this.updateUI(); // Al cerrar, el updateUI detectará si hay fotos y volverá a mostrar la galería
        },

        switchCamera() {
            if (this.stream) this.stream.getTracks().forEach(track => track.stop());
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
            this.openCamera();
        },

        // --- 3. MOTOR DE RECORTE MATEMÁTICO EXACTO ---
        capturePhoto() {
            if (this.getGalleryCount() >= this.MAX_PAGES) {
                return alert(`Límite máximo de ${this.MAX_PAGES} páginas alcanzado.`);
            }
            if (!this.DOM.video.videoWidth) return; 

            const vw = this.DOM.video.videoWidth;
            const vh = this.DOM.video.videoHeight;
            const cw = this.DOM.video.clientWidth;
            const ch = this.DOM.video.clientHeight;
            
            const scale = Math.max(cw / vw, ch / vh);
            
            const offsetX = ((vw * scale) - cw) / 2;
            const offsetY = ((vh * scale) - ch) / 2;

            const guideRect = this.DOM.guide.getBoundingClientRect();
            const videoRect = this.DOM.video.getBoundingClientRect();
            
            const cropX = ((guideRect.left - videoRect.left) + offsetX) / scale;
            const cropY = ((guideRect.top - videoRect.top) + offsetY) / scale;
            const cropW = guideRect.width / scale;
            const cropH = guideRect.height / scale;

            this.DOM.canvas.width = cropW;
            this.DOM.canvas.height = cropH;
            this.DOM.ctx.drawImage(this.DOM.video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            this.tempImageBase64 = this.DOM.canvas.toDataURL('image/jpeg', 0.9);
            this.DOM.preview.src = this.tempImageBase64;
            
            this.DOM.preview.classList.remove('d-none');
            this.DOM.guide.style.opacity = '0';
            this.DOM.controlsCapture.classList.add('d-none');
            this.DOM.controlsReview.classList.remove('d-none');
        },

        resetCameraUI() {
            this.tempImageBase64 = null;
            this.DOM.preview.classList.add('d-none');
            this.DOM.guide.style.opacity = '1';
            this.DOM.controlsReview.classList.add('d-none');
            this.DOM.controlsCapture.classList.remove('d-none');
        },

        acceptPhoto() {
            this.addPageToGallery(this.tempImageBase64);
            this.resetCameraUI(); 
            this.closeCamera(); // Vuelve automáticamente a la galería
        },

        // --- 4. IMPORTACIÓN Y EXTRACCIÓN ---
        async handleFileUpload(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            this.showLoading("Procesando archivos...");

            for (let file of files) {
                if (this.getGalleryCount() >= this.MAX_PAGES) {
                    alert(`Límite de ${this.MAX_PAGES} páginas alcanzado.`);
                    break;
                }
                
                try {
                    if (file.type.includes('image')) {
                        await this.processImageFile(file);
                    } else if (file.type === 'application/pdf') {
                        await this.processPDFFile(file);
                    }
                } catch (error) {
                    console.error("Error al procesar archivo:", error);
                }
            }

            this.hideLoading();
            this.DOM.fileUpload.value = ''; 
        },

        processImageFile(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    this.addPageToGallery(e.target.result);
                    resolve();
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },

        async processPDFFile(file) {
            this.DOM.loadingText.textContent = "Extrayendo páginas del PDF...";
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            for (let i = 1; i <= pdf.numPages; i++) {
                if (this.getGalleryCount() >= this.MAX_PAGES) break;
                
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 }); 
                
                this.DOM.canvas.width = viewport.width;
                this.DOM.canvas.height = viewport.height;
                
                await page.render({ canvasContext: this.DOM.ctx, viewport }).promise;
                this.addPageToGallery(this.DOM.canvas.toDataURL('image/jpeg', 0.9));
            }
        },

        // --- 5. GALERÍA Y REORDENAMIENTO ---
        initSortable() {
            new Sortable(this.DOM.gallery, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                delay: 150, 
                delayOnTouchOnly: true, 
                onEnd: () => this.updateUI()
            });
        },

        getGalleryCount() {
            return this.DOM.gallery.querySelectorAll('.gallery-item').length;
        },

        addPageToGallery(base64Src) {
            const col = document.createElement('div');
            col.className = 'col'; 
            col.innerHTML = `
                <div class="gallery-item">
                    <button class="btn-delete" title="Eliminar"><i class="bi bi-trash3-fill"></i></button>
                    <img src="${base64Src}" class="scanned-img" alt="Documento">
                    <div class="page-badge">Pág <span class="page-num"></span></div>
                </div>
            `;

            col.querySelector('.btn-delete').addEventListener('click', () => {
                col.style.transform = 'scale(0)';
                col.style.transition = 'transform 0.2s';
                setTimeout(() => { col.remove(); this.updateUI(); }, 200);
            });

            this.DOM.gallery.appendChild(col);
            this.updateUI();
        },

        updateUI() {
            const count = this.getGalleryCount();
            
            this.DOM.gallery.querySelectorAll('.gallery-item').forEach((item, index) => {
                item.querySelector('.page-num').textContent = index + 1;
            });

            this.DOM.pageCounter.textContent = `${count} / ${this.MAX_PAGES} Páginas`;
            this.DOM.pageCounter.className = count >= this.MAX_PAGES 
                ? 'badge bg-danger rounded-pill fs-6 px-3 shadow-sm' 
                : 'badge bg-primary rounded-pill fs-6 px-3 shadow-sm';

            if (count > 0) {
                this.DOM.homeState.classList.add('d-none');
                this.DOM.galSection.classList.remove('d-none');
                this.DOM.footer.classList.remove('d-none');
            } else {
                this.DOM.homeState.classList.remove('d-none');
                this.DOM.galSection.classList.add('d-none');
                this.DOM.footer.classList.add('d-none');
            }
        },

        // --- 6. GENERACIÓN FINAL DEL ARCHIVO PDF ---
        generatePDF() {
            const originalBtnHtml = this.DOM.btnGeneratePdf.innerHTML;
            this.DOM.btnGeneratePdf.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Procesando PDF...';
            this.DOM.btnGeneratePdf.disabled = true;

            const formatStr = this.DOM.formatSelect.value;
            let filename = this.DOM.filenameInput.value.trim() || "Documento_Escaneado";
            const marginRadio = document.querySelector('input[name="marginOptions"]:checked');
            const margin = marginRadio ? parseInt(marginRadio.value) : 0;

            setTimeout(() => {
                try {
                    const images = Array.from(this.DOM.gallery.querySelectorAll('.scanned-img')).map(img => img.src);
                    if(images.length === 0) throw new Error("La galería está vacía.");

                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF('p', 'mm', formatStr); 
                    
                    const pdfW = doc.internal.pageSize.getWidth();
                    const pdfH = doc.internal.pageSize.getHeight();

                    images.forEach((imgData, index) => {
                        if (index > 0) doc.addPage();
                        
                        const imgProps = doc.getImageProperties(imgData);
                        
                        const availW = pdfW - (margin * 2); 
                        const availH = pdfH - (margin * 2);
                        
                        let finalW = availW; 
                        let finalH = (imgProps.height * availW) / imgProps.width;

                        if (finalH > availH) { 
                            finalH = availH; 
                            finalW = (imgProps.width * availH) / imgProps.height; 
                        }

                        const x = margin + ((availW - finalW) / 2); 
                        const y = margin + ((availH - finalH) / 2);
                        
                        doc.addImage(imgData, 'JPEG', x, y, finalW, finalH);
                    });

                    doc.save(`${filename}.pdf`);
                    this.DOM.settingsModal.hide();

                } catch (error) {
                    console.error("Error exportando PDF:", error);
                    alert("Ocurrió un error al generar el PDF. Asegúrate de tener al menos una página.");
                } finally {
                    this.DOM.btnGeneratePdf.innerHTML = originalBtnHtml;
                    this.DOM.btnGeneratePdf.disabled = false;
                }
            }, 300);
        },

        showLoading(text) {
            this.DOM.loadingText.textContent = text;
            this.DOM.loadingOverlay.style.display = 'flex';
        },

        hideLoading() {
            this.DOM.loadingOverlay.style.display = 'none';
        }
    };

    ScannerApp.init();
});
