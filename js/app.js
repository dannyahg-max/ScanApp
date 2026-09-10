/**
 * Scanner PDF Pro - Lógica Principal
 * Arquitectura modular ES6
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const ScannerApp = {
        // --- CONSTANTES Y ESTADO ---
        MAX_PAGES: 20,
        stream: null,
        tempImageBase64: null,
        currentFacingMode: 'environment', // Inicia con cámara trasera

        // --- REFERENCIAS AL DOM ---
        DOM: {
            // Secciones
            homeState: document.getElementById('home-state'),
            camSection: document.getElementById('camera-section'),
            galSection: document.getElementById('gallery-section'),
            footer: document.getElementById('action-footer'),
            
            // Cámara y UI
            video: document.getElementById('video-feed'),
            preview: document.getElementById('photo-preview'),
            guide: document.getElementById('scanner-guide'),
            canvas: document.getElementById('canvas'),
            ctx: document.getElementById('canvas').getContext('2d'),
            controlsCapture: document.getElementById('controls-capture'),
            controlsReview: document.getElementById('controls-review'),
            
            // Galería y Carga
            gallery: document.getElementById('gallery'),
            fileUpload: document.getElementById('file-upload'),
            loadingOverlay: document.getElementById('loading-overlay'),
            loadingText: document.getElementById('loading-text'),
            pageCounter: document.getElementById('page-counter'),
            
            // Modal de Exportación
            settingsModal: new bootstrap.Modal(document.getElementById('settingsModal')),
            formatSelect: document.getElementById('doc-format'),
            filenameInput: document.getElementById('pdf-filename'),
            btnGeneratePdf: document.getElementById('btn-generate-pdf')
        },

        // --- 1. INICIALIZACIÓN ---
        init() {
            this.bindEvents();
            this.initSortable();
        },

        bindEvents() {
            // Eventos de Cámara
            document.getElementById('btn-open-camera').addEventListener('click', () => this.openCamera());
            document.getElementById('btn-close-camera').addEventListener('click', () => this.closeCamera());
            document.getElementById('btn-switch').addEventListener('click', () => this.switchCamera());
            document.getElementById('btn-capture').addEventListener('click', () => this.capturePhoto());
            document.getElementById('btn-retake').addEventListener('click', () => this.resetCameraUI());
            document.getElementById('btn-accept').addEventListener('click', () => this.acceptPhoto());

            // Eventos de Importación
            this.DOM.fileUpload.addEventListener('change', (e) => this.handleFileUpload(e));

            // Eventos de Generación PDF
            document.getElementById('btn-finish').addEventListener('click', () => this.DOM.settingsModal.show());
            this.DOM.btnGeneratePdf.addEventListener('click', () => this.generatePDF());
        },
// 2.- Apertura de Cámara
async openCamera() {
            this.DOM.homeState.classList.add('d-none');
            this.DOM.camSection.classList.remove('d-none');
            
            // 1. Intentamos forzar Alta Resolución y Cámara Trasera/Frontal específica
            let constraints = {
                video: { facingMode: this.currentFacingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false
            };

            try {
                this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err1) {
                console.warn("Fallo con alta resolución, intentando configuración básica...", err1);
                
                try {
                    // 2. Fallback: Calidad que el navegador decida, pero manteniendo trasera/frontal
                    constraints = { video: { facingMode: this.currentFacingMode }, audio: false };
                    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
                } catch (err2) {
                    console.warn("Fallo con configuración básica, intentando cualquier cámara...", err2);
                    
                    try {
                        // 3. Fallback final: Enciende CUALQUIER cámara disponible a cualquier resolución
                        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    } catch (err3) {
                        // Si falla aquí, mostramos el error exacto en pantalla para saber qué pasa
                        alert(`Error de cámara: ${err3.name}\n${err3.message}\n\nAsegúrate de dar permisos y de estar en un sitio seguro (HTTPS o localhost).`);
                        this.closeCamera();
                        return; // Detenemos la ejecución
                    }
                }
            }

            // Si llegamos hasta aquí, logramos capturar una cámara exitosamente
            if (this.stream) {
                this.DOM.video.srcObject = this.stream;
                
                // Forzamos la reproducción en móviles para evitar pantallas negras o blancas
                this.DOM.video.onloadedmetadata = () => {
                    this.DOM.video.play().catch(e => {
                        console.error("Error al reproducir el video:", e);
                    });
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
            this.updateUI();
        },

        switchCamera() {
            if (this.stream) this.stream.getTracks().forEach(track => track.stop());
            this.currentFacingMode = this.currentFacingMode === 'environment' ? 'user' : 'environment';
            this.openCamera();
        },

        // --- 3. MOTOR DE RECORTE MATEMÁTICO ---
        capturePhoto() {
            if (this.getGalleryCount() >= this.MAX_PAGES) {
                return alert(`Límite máximo de ${this.MAX_PAGES} páginas alcanzado.`);
            }
            if (!this.DOM.video.videoWidth) return;

            // 1. Dimensiones nativas de la cámara vs CSS Container
            const vw = this.DOM.video.videoWidth;
            const vh = this.DOM.video.videoHeight;
            const cw = this.DOM.video.clientWidth;
            const ch = this.DOM.video.clientHeight;
            
            // 2. Escala de 'object-fit: cover'
            const scale = Math.max(cw / vw, ch / vh);
            
            // 3. Offset (Lo que quedó recortado y no se ve en pantalla)
            const offsetX = ((vw * scale) - cw) / 2;
            const offsetY = ((vh * scale) - ch) / 2;

            // 4. Posición de la guía A4 relativa al video
            const guideRect = this.DOM.guide.getBoundingClientRect();
            const videoRect = this.DOM.video.getBoundingClientRect();
            
            // 5. Cálculos para extracción exacta
            const cropX = ((guideRect.left - videoRect.left) + offsetX) / scale;
            const cropY = ((guideRect.top - videoRect.top) + offsetY) / scale;
            const cropW = guideRect.width / scale;
            const cropH = guideRect.height / scale;

            // 6. Aplicar recorte al Canvas
            this.DOM.canvas.width = cropW;
            this.DOM.canvas.height = cropH;
            this.DOM.ctx.drawImage(this.DOM.video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
            
            // Guardar imagen y cambiar UI
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
            this.closeCamera(); // Cerramos la cámara para volver al panel de trabajo
        },

        // --- 4. IMPORTACIÓN (PDF.js y FileReader) ---
        async handleFileUpload(event) {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            this.showLoading("Extrayendo archivos...");

            for (let file of files) {
                if (this.getGalleryCount() >= this.MAX_PAGES) {
                    alert(`Límite de ${this.MAX_PAGES} páginas alcanzado. Algunos archivos se omitieron.`);
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
            this.DOM.fileUpload.value = ''; // Limpiar input
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
            this.DOM.loadingText.textContent = "Desarmando PDF...";
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
            
            for (let i = 1; i <= pdf.numPages; i++) {
                if (this.getGalleryCount() >= this.MAX_PAGES) break;
                
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 }); // Escala 1.5 balancea calidad/memoria
                
                this.DOM.canvas.width = viewport.width;
                this.DOM.canvas.height = viewport.height;
                
                await page.render({ canvasContext: this.DOM.ctx, viewport }).promise;
                this.addPageToGallery(this.DOM.canvas.toDataURL('image/jpeg', 0.9));
            }
        },

        // --- 5. GALERÍA Y SORTABLE ---
        initSortable() {
            new Sortable(this.DOM.gallery, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                delay: 150, 
                delayOnTouchOnly: true,
                onEnd: () => this.updateUI() // Renumera al soltar
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
                    <img src="${base64Src}" class="scanned-img" alt="Página Escaneada">
                    <div class="page-badge">Pág <span class="page-num"></span></div>
                </div>
            `;

            // Evento de eliminación
            col.querySelector('.btn-delete').addEventListener('click', () => {
                col.style.transform = 'scale(0)';
                setTimeout(() => { col.remove(); this.updateUI(); }, 200);
            });

            this.DOM.gallery.appendChild(col);
            this.updateUI();
        },

        updateUI() {
            const count = this.getGalleryCount();
            
            // Renumerar páginas visualmente
            this.DOM.gallery.querySelectorAll('.gallery-item').forEach((item, index) => {
                item.querySelector('.page-num').textContent = index + 1;
            });

            // Actualizar contadores
            this.DOM.pageCounter.textContent = `${count} / ${this.MAX_PAGES} Páginas`;
            this.DOM.pageCounter.className = count >= this.MAX_PAGES 
                ? 'badge bg-danger rounded-pill fs-6 px-3' 
                : 'badge bg-primary rounded-pill fs-6 px-3';

            // Mostrar/Ocultar áreas según haya páginas
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

        // --- 6. GENERADOR DE PDF FINAL ---
        generatePDF() {
            const originalBtnHtml = this.DOM.btnGeneratePdf.innerHTML;
            this.DOM.btnGeneratePdf.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Ensamblando...';
            this.DOM.btnGeneratePdf.disabled = true;

            // Extraer parámetros
            const formatStr = this.DOM.formatSelect.value; // 'a4' o 'letter'
            let filename = this.DOM.filenameInput.value.trim() || "Documento_Escaneado";
            const margin = parseInt(document.querySelector('input[name="marginOptions"]:checked').value);

            // Timeout para permitir que la UI se actualice (muestre el spinner)
            setTimeout(() => {
                try {
                    // 1. Extraer imágenes en su orden actual del DOM
                    const images = Array.from(this.DOM.gallery.querySelectorAll('.scanned-img')).map(img => img.src);
                    
                    // 2. Iniciar jsPDF
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF('p', 'mm', formatStr); 
                    
                    const pdfW = doc.internal.pageSize.getWidth();
                    const pdfH = doc.internal.pageSize.getHeight();

                    // 3. Procesar cada imagen
                    images.forEach((imgData, index) => {
                        if (index > 0) doc.addPage();
                        
                        const imgProps = doc.getImageProperties(imgData);
                        
                        // Restar márgenes (doble porque aplica a ambos lados)
                        const availW = pdfW - (margin * 2); 
                        const availH = pdfH - (margin * 2);
                        
                        // Lógica de Fit (Contener imagen sin deformar)
                        let finalW = availW; 
                        let finalH = (imgProps.height * availW) / imgProps.width;

                        if (finalH > availH) { 
                            finalH = availH; 
                            finalW = (imgProps.width * availH) / imgProps.height; 
                        }

                        // Centrar matemáticamente
                        const x = margin + ((availW - finalW) / 2); 
                        const y = margin + ((availH - finalH) / 2);
                        
                        doc.addImage(imgData, 'JPEG', x, y, finalW, finalH);
                    });

                    // 4. Descargar
                    doc.save(`${filename}.pdf`);
                    this.DOM.settingsModal.hide();

                } catch (error) {
                    console.error("Error generando PDF:", error);
                    alert("Ocurrió un error al generar el PDF.");
                } finally {
                    // Restaurar botón
                    this.DOM.btnGeneratePdf.innerHTML = originalBtnHtml;
                    this.DOM.btnGeneratePdf.disabled = false;
                }
            }, 300);
        },

        // --- UTILIDADES ---
        showLoading(text) {
            this.DOM.loadingText.textContent = text;
            this.DOM.loadingOverlay.style.display = 'flex';
        },

        hideLoading() {
            this.DOM.loadingOverlay.style.display = 'none';
        }
    };

    // Iniciar aplicación
    ScannerApp.init();
});
