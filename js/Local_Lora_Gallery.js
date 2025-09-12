import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LocalLoraGalleryNode = {
    name: "LocalLoraGallery",
    isLoading: false,
    currentPage: 1,
    totalPages: 1,
    
    async getLoras(filter_tag = "", mode = "OR", folder = "", page = 1, selected_loras = []) {
        this.isLoading = true;
        try {
            let url = `/localloragallery/get_loras?filter_tag=${encodeURIComponent(filter_tag)}&mode=${mode}&folder=${encodeURIComponent(folder)}&page=${page}`;
            selected_loras.forEach(lora => {
                url += `&selected_loras=${encodeURIComponent(lora)}`;
            });
            const response = await api.fetchApi(url);
            const data = await response.json();
            this.totalPages = data.total_pages || 1;
            this.currentPage = data.current_page || 1;
            return data;
        } catch (error) {
            console.error("LocalLoraGallery: Error fetching LoRAs:", error);
            return { loras: [], folders: [], total_pages: 1, current_page: 1 };
        } finally {
            this.isLoading = false;
        }
    },

    async updateMetadata(lora_name, data) {
        try {
            const body = { lora_name, ...data };
            await api.fetchApi("/localloragallery/update_metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        } catch(e) {
            console.error("LocalLoraGallery: Failed to update metadata", e);
        }
    },

    async setUiState(nodeId, galleryId, state) {
        try {
            await api.fetchApi("/localloragallery/set_ui_state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    node_id: nodeId, 
                    gallery_id: galleryId,
                    state: state 
                }),
            });
        } catch(e) {
            console.error("LocalLoraGallery: Failed to set UI state", e);
        }
    },

    setup(nodeType, nodeData) {
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);

            if (!this.properties || !this.properties.lora_gallery_unique_id) {
                if (!this.properties) { this.properties = {}; }
                this.properties.lora_gallery_unique_id = "lora-gallery-" + Math.random().toString(36).substring(2, 11);
            }

            const galleryIdWidget = this.addWidget(
                "text",
                "lora_gallery_unique_id_widget",
                this.properties.lora_gallery_unique_id,
                () => {},
                {}
            );

            galleryIdWidget.serializeValue = () => {
                return this.properties.lora_gallery_unique_id;
            };

            galleryIdWidget.draw = function(ctx, node, widget_width, y, widget_height) {};
            galleryIdWidget.computeSize = function(width) {
                return [0, -4];
            }
            
            const HEADER_HEIGHT = 90;
            const MIN_NODE_WIDTH = 600;

            this.size = [700, 600];
            this.loraData = [];
            this.availableLoras = [];
            this.isModelOnly = nodeData.name.includes("ModelOnly");
            this.selectedCardsForEditing = new Set(); 

            const node_instance = this;
            const selectionWidget = this.addWidget(
                "text",
                "selection_data",
                this.properties.selection_data || "[]",
                () => {},
                { multiline: true }
            );
            selectionWidget.serializeValue = () => {
                return node_instance.properties["selection_data"] || "[]";
            };
            selectionWidget.draw = function(ctx, node, widget_width, y, widget_height) {};
            selectionWidget.computeSize = function(width) { return [0, -4]; };

            const widgetContainer = document.createElement("div");
            widgetContainer.className = "locallora-container-wrapper";
            this.addDOMWidget("gallery", "div", widgetContainer, {});

            const uniqueId = `locallora-gallery-${this.id}`;
            widgetContainer.innerHTML = `
                <style>
                    #${uniqueId} .locallora-container { display: flex; flex-direction: column; height: 100%; font-family: sans-serif; }
                    #${uniqueId} .locallora-selected-list { flex-shrink: 0; padding: 5px; background-color: #22222200; max-height: 100%; }
                    #${uniqueId} .locallora-lora-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
                    #${uniqueId} .locallora-lora-item .lora-name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
                    #${uniqueId} .locallora-lora-item input[type=number] { width: 60px; background-color: #333; border: 1px solid #555; border-radius: 4px; color: #ccc; }
                    #${uniqueId} .locallora-lora-item .lora-label { font-size: 10px; color: var(--node-text-color); }
                    #${uniqueId} .locallora-controls { display: flex; flex-direction: column; padding: 5px; gap: 5px; flex-shrink: 0; }
                    #${uniqueId} .locallora-controls-row { display: flex; gap: 10px; align-items: center; }
                    #${uniqueId} .locallora-controls-row input[type=text], #${uniqueId} .locallora-controls-row select {
                        background: #222; color: #ccc; border: 1px solid #555; padding: 4px; border-radius: 4px;
                    }
                    #${uniqueId} .locallora-gallery { flex-grow: 1; overflow-y: auto; background-color: #1a1a1a; padding: 5px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; align-content: start; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar { width: 8px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-thumb { background-color: #555; border-radius: 4px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-thumb:hover { background-color: #777; }                    
                    #${uniqueId} .locallora-lora-card { cursor: pointer; border: 3px solid transparent; border-radius: 8px; background-color: var(--comfy-input-bg); transition: border-color 0.2s; display: flex; flex-direction: column; position: relative; }
                    #${uniqueId} .locallora-lora-card.selected-edit { border-color: #FFD700; box-shadow: 0 0 10px #FFD700; }
                    #${uniqueId} .locallora-lora-card.selected-flow { border-color: #00FFC9; }
                    
                    #${uniqueId} .locallora-media-container {
                        width: 100%; height: 150px; background-color: #111;
                        border-top-left-radius: 5px; border-top-right-radius: 5px;
                        overflow: hidden; display: flex; align-items: center; justify-content: center;
                    }
                    #${uniqueId} .locallora-media-container img,
                    #${uniqueId} .locallora-media-container video {
                        width: 100%; height: 100%; object-fit: cover;
                    }

                    #${uniqueId} .locallora-lora-card-info { padding: 4px; flex-grow: 1; display: flex; flex-direction: column; }
                    #${uniqueId} .locallora-lora-card p { font-size: 11px; margin: 0; word-break: break-all; text-align: center; color: var(--node-text-color); }
                    
                    #${uniqueId} .lora-card-triggers {
                        font-size: 10px; color: #a5a5a5; padding: 2px 4px; margin-top: 2px;
                        text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-height: 14px;
                    }

                    #${uniqueId} .lora-card-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: auto; padding-top: 4px; }
                    #${uniqueId} .lora-card-tags .tag { background-color: #006699; color: #fff; padding: 1px 4px; font-size: 10px; border-radius: 3px; cursor: pointer; }
                    #${uniqueId} .lora-card-tags .tag:hover { background-color: #0088CC; }
                    
                    #${uniqueId} .locallora-metadata-editor { display: none; flex-direction: column; gap: 5px; }
                    #${uniqueId} .locallora-metadata-editor.visible { display: flex; }
                    #${uniqueId} .tag-editor-list .tag .remove-tag { margin-left: 4px; color: #fdd; cursor: pointer; font-weight: bold; }
                    
                    #${uniqueId} .edit-tags-btn {
                        position: absolute; bottom: 4px; right: 4px; width: 22px; height: 22px; background-color: rgba(0,0,0,0.5);
                        color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                        font-size: 12px; transition: background-color 0.2s; opacity: 0;
                    }
                    #${uniqueId} .lora-card-link-btn {
                        position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; background-color: rgba(0,0,0,0.5);
                        color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center;
                        font-size: 14px; cursor: pointer; transition: background-color 0.2s; opacity: 0; text-decoration: none;
                    }
                    #${uniqueId} .locallora-lora-card:hover .edit-tags-btn, #${uniqueId} .locallora-lora-card:hover .lora-card-link-btn { opacity: 1; }
                    #${uniqueId} .edit-tags-btn:hover, #${uniqueId} .lora-card-link-btn:hover { background-color: rgba(0,0,0,0.8); }

                    #${uniqueId} .locallora-container.gallery-collapsed .locallora-gallery { display: none; }
                    #${uniqueId} .locallora-lora-item .remove-lora-btn {
                        background: #555; color: #fff; border: none; border-radius: 10%;
                        text-align: center; cursor: pointer; margin-left: auto; flex-shrink: 0;
                    }
                    #${uniqueId} .locallora-lora-item .remove-lora-btn:hover { background: #ff4444; }
                    #${uniqueId} .tag-filter-mode-btn {
                        padding: 4px 8px; background-color: #555; color: #fff; border: 1px solid #666;
                        border-radius: 4px; cursor: pointer; flex-shrink: 0;
                    }
                    #${uniqueId} .tag-filter-mode-btn:hover { background-color: #666; }
                    #${uniqueId} .locallora-multiselect-tag { position: relative; flex-grow: 1; }
                    #${uniqueId} .locallora-multiselect-tag-display { 
                        background-color: #333; color: #ccc; border: 1px solid #555; border-radius: 4px; padding: 4px; font-size: 10px;
                        height: 23px; cursor: pointer; display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
                    }
                    #${uniqueId} .locallora-multiselect-arrow {
                        position: absolute;
                        right: 8px;
                        top: 50%;
                        transform: translateY(-50%);
                        transition: transform 0.2s ease-in-out;
                        font-size: 10px;
                        pointer-events: none;
                    }
                    #${uniqueId} .locallora-multiselect-arrow.open {
                        transform: translateY(-50%) rotate(180deg);
                    }
                    #${uniqueId} .locallora-multiselect-tag-dropdown {
                        display: none; position: absolute; top: 100%; left: 0; right: 0; background-color: #222;
                        border: 1px solid #555; border-top: none; max-height: 200px; overflow-y: auto; z-index: 10;
                    }
                    #${uniqueId} .locallora-multiselect-tag-dropdown label {
                        display: block; padding: 0px 0px; cursor: pointer; font-size: 12px; color: #ccc;
                    }
                    #${uniqueId} .locallora-multiselect-tag-dropdown label:hover { background-color: #444; }
                    #${uniqueId} .tag-filter-input-wrapper { display: flex; flex-grow: 1; position: relative; align-items: center; }
                    #${uniqueId} .tag-filter-input-wrapper input { flex-grow: 1; }
                    #${uniqueId} .clear-tag-filter-btn {
                        background: none; border: none; color: #ccc; cursor: pointer; 
                        position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
                        display: none;
                    }
                    #${uniqueId} .tag-filter-input-wrapper input:not(:placeholder-shown) + .clear-tag-filter-btn {
                        display: block;
                    }

                    #${uniqueId} .locallora-lora-item { cursor: grab; user-select: none; }
                    #${uniqueId} .locallora-lora-item.dragging { opacity: 0.5; background: #555; }
                    #${uniqueId} .locallora-lora-item.drag-over { border-top: 2px solid #4A90E2; }

                    #${uniqueId} .locallora-preset-container { position: relative; display: inline-block; margin-bottom: 3px; }
                    #${uniqueId} .preset-dropdown {
                        display: none; position: absolute; background-color: #222;
                        min-width: 160px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
                        z-index: 10; border: 1px solid #555; right: 0;
                    }
                    #${uniqueId} .preset-dropdown a {
                        color: #ccc; padding: 8px 12px; text-decoration: none;
                        display: flex; justify-content: space-between; align-items: center; font-size: 12px;
                    }
                    #${uniqueId} .preset-dropdown a:hover { background-color: #444; }
                    #${uniqueId} .delete-preset-btn {
                        color: #ff6666; cursor: pointer; font-weight: bold; padding-left: 10px;
                    }
                    #${uniqueId} .delete-preset-btn:hover { color: #ff0000; }
                </style>
                <div id="${uniqueId}" style="height: 100%;">
                    <div class="locallora-container">
                        <div class="locallora-selected-list"></div>
                        <div class="locallora-controls">
                            <div class="locallora-controls-row">
                                <button class="toggle-all-btn">Toggle All</button>
                                <input type="text" class="search-input" placeholder="Filter by Name..." style="flex-grow: 1;">
                                <button class="save-preset-btn" title="Save current stack as preset">Save Preset</button>
                                <div class="locallora-preset-container">
                                    <button class="load-preset-btn">Load Preset ▼</button>
                                    <div class="preset-dropdown"></div>
                                </div>
                                <button class="clear-all-btn" title="Clear all selected LoRAs">Clear All</button>
                            </div>
                            
                            <div class="locallora-metadata-editor">
                                <div class="locallora-controls-row">
                                    <label style="font-size:12px;">Edit Tags (<span class="selected-count">0</span>):</label>
                                    <div class="tag-editor-list lora-card-tags" style="flex-grow:1;"></div>
                                    <input type="text" class="tag-editor-input" placeholder="Add tag..." style="width: 100px;">
                                </div>
                                <div class="locallora-controls-row trigger-editor-row" style="display:none;">
                                    <label style="font-size:12px;">Triggers:</label>
                                    <input type="text" class="trigger-editor-input" placeholder="Enter trigger words..." style="flex-grow: 1;">
                                </div>
                                <div class="locallora-controls-row url-editor-row" style="display:none;">
                                    <label style="font-size:12px;">URL:</label>
                                    <input type="text" class="url-editor-input" placeholder="Enter download URL..." style="flex-grow: 1;">
                                </div>
                            </div>

                            <div class="locallora-controls-row">
                                <button class="tag-filter-mode-btn" title="Click to switch filter mode">OR</button>
                                <div class="tag-filter-input-wrapper">
                                    <input type="text" class="tag-filter-input" placeholder="Filter by Tag...">
                                    <button class="clear-tag-filter-btn" title="Clear Tag Filter">✖</button>
                                </div>
                                <div class="locallora-multiselect-tag">
                                    <div class="locallora-multiselect-tag-display">
                                        Select Tags
                                        <span class="locallora-multiselect-arrow">▼</span>
                                    </div>
                                    <div class="locallora-multiselect-tag-dropdown"></div>
                                </div>
                                <select class="folder-filter-select" style="background: #222; color: #ccc; border: 1px solid #555; padding: 4px; border-radius: 4px; max-width: 150px;">
                                    <option value="">All Folders</option>
                                </select>
                                <button class="toggle-gallery-btn" title="Toggle Gallery" style="margin-left: auto; flex-shrink: 0;">Hide Gallery</button>
                            </div>
                        </div>
                        <div class="locallora-gallery"><p>Loading LoRAs...</p></div>
                    </div>
                </div>
            `;
            
            const mainContainer = widgetContainer.querySelector(".locallora-container");
            const selectedListEl = widgetContainer.querySelector(".locallora-selected-list");
            const galleryEl = widgetContainer.querySelector(".locallora-gallery");
            const searchInput = widgetContainer.querySelector(".search-input");
            const metadataEditor = widgetContainer.querySelector(".locallora-metadata-editor");
            const tagEditorList = widgetContainer.querySelector(".tag-editor-list");
            const tagEditorInput = widgetContainer.querySelector(".tag-editor-input");
            const triggerEditorRow = widgetContainer.querySelector(".trigger-editor-row");
            const triggerEditorInput = widgetContainer.querySelector(".trigger-editor-input");
            const urlEditorRow = widgetContainer.querySelector(".url-editor-row");
            const urlEditorInput = widgetContainer.querySelector(".url-editor-input");
            const tagFilterInput = widgetContainer.querySelector(".tag-filter-input");
            const multiSelectTagContainer = widgetContainer.querySelector(".locallora-multiselect-tag");
            const multiSelectTagDisplay = multiSelectTagContainer.querySelector(".locallora-multiselect-tag-display");
            const multiSelectTagDropdown = multiSelectTagContainer.querySelector(".locallora-multiselect-tag-dropdown");
            const tagFilterModeBtn = widgetContainer.querySelector(".tag-filter-mode-btn");
            const toggleGalleryBtn = widgetContainer.querySelector(".toggle-gallery-btn");
            const selectedCountEl = widgetContainer.querySelector(".selected-count");
            const clearTagFilterBtn = widgetContainer.querySelector(".clear-tag-filter-btn");
            const folderFilterSelect = widgetContainer.querySelector(".folder-filter-select");
            const savePresetBtn = widgetContainer.querySelector(".save-preset-btn");
            const loadPresetBtn = widgetContainer.querySelector(".load-preset-btn");
            const presetDropdown = widgetContainer.querySelector(".preset-dropdown");

            const saveStateAndFetch = () => {
                const stateToSave = {
                    filter_tag: tagFilterInput.value,
                    filter_mode: tagFilterModeBtn.textContent,
                    filter_folder: folderFilterSelect.value
                };
                LocalLoraGalleryNode.setUiState(this.id, this.properties.lora_gallery_unique_id, stateToSave);
                fetchAndRender(false);
            };

            const updatePresetButtonText = (presetName = null) => {
                if (presetName) {
                    loadPresetBtn.textContent = `Preset: ${presetName} ▼`;
                    loadPresetBtn.title = `Current Preset: ${presetName}`;
                } else {
                    loadPresetBtn.textContent = "Load Preset ▼";
                    loadPresetBtn.title = "Load a saved preset";
                }
            };

            galleryEl.addEventListener('scroll', () => {
                if (this.isLoading || this.currentPage >= this.totalPages) return;
                const { scrollTop, scrollHeight, clientHeight } = galleryEl;
                if (scrollHeight - scrollTop - clientHeight < 400) {
                    fetchAndRender(true);
                }
            });

            const updateSelection = () => {
                const serializableData = this.loraData.map(({ element, ...rest }) => rest);
                const selectionJson = JSON.stringify(serializableData);

                this.setProperty("selection_data", selectionJson);

                const widget = this.widgets.find(w => w.name === "selection_data");
                if (widget) {
                    widget.value = selectionJson;
                }

                LocalLoraGalleryNode.setUiState(this.id, this.properties.lora_gallery_unique_id, { 
                    is_collapsed: mainContainer.classList.contains("gallery-collapsed"),
                    lora_stack: serializableData 
                });
            };
            
            let draggedIndex = -1;

            const renderSelectedList = () => {
                selectedListEl.innerHTML = "";
                this.loraData.forEach((item, index) => {
                    const el = document.createElement("div");
                    el.className = "locallora-lora-item";
                    el.draggable = true;
                    el.dataset.index = index;
                    
                    const toggle = document.createElement("input");
                    toggle.type = "checkbox";
                    toggle.checked = item.on;
                    toggle.addEventListener("change", (e) => { this.loraData[index].on = e.target.checked; updateSelection(); });
                    
                    const nameLabel = document.createElement("span");
                    nameLabel.className = "lora-name";
                    nameLabel.textContent = item.lora;
                    nameLabel.title = item.lora;
                    
                    const strengthModelLabel = document.createElement("span");
                    strengthModelLabel.className = "lora-label";
                    strengthModelLabel.textContent = "Model";
                    
                    const strengthModelInput = document.createElement("input");
                    strengthModelInput.type = "number";
                    strengthModelInput.value = item.strength;
                    strengthModelInput.min = -2.0; strengthModelInput.max = 2.0; strengthModelInput.step = 0.05;
                    strengthModelInput.addEventListener("change", (e) => { this.loraData[index].strength = parseFloat(e.target.value); updateSelection(); });
                    
                    el.appendChild(toggle);
                    el.appendChild(nameLabel);
                    el.appendChild(strengthModelLabel);
                    el.appendChild(strengthModelInput);

                    if (!this.isModelOnly) {
                        const strengthClipLabel = document.createElement("span");
                        strengthClipLabel.className = "lora-label";
                        strengthClipLabel.textContent = "CLIP";
                        const strengthClipInput = document.createElement("input");
                        strengthClipInput.type = "number";
                        strengthClipInput.value = item.strength_clip;
                        strengthClipInput.min = -2.0; strengthClipInput.max = 2.0; strengthClipInput.step = 0.05;
                        strengthClipInput.addEventListener("change", (e) => { this.loraData[index].strength_clip = parseFloat(e.target.value); updateSelection(); });
                        el.appendChild(strengthClipLabel);
                        el.appendChild(strengthClipInput);
                    }

                    const removeBtn = document.createElement("button");
                    removeBtn.className = "remove-lora-btn";
                    removeBtn.textContent = "✖";
                    removeBtn.title = "Remove LoRA";
                    
                    removeBtn.addEventListener("click", () => {
                        this.loraData.splice(index, 1);
                        renderSelectedList();
                        updateSelection();
                        if (mainContainer.classList.contains("gallery-collapsed")) {
                            setTimeout(() => {
                                const controlsEl = widgetContainer.querySelector(".locallora-controls");
                                const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                                this.size[1] = contentHeight + HEADER_HEIGHT;
                                this.setDirtyCanvas(true, true);
                            }, 0);
                        }
                        fetchAndRender(false);
                        updatePresetButtonText(null);
                    });
                    el.appendChild(removeBtn);

                    el.addEventListener('dragstart', (e) => {
                        draggedIndex = parseInt(e.currentTarget.dataset.index);
                        e.currentTarget.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    });

                    el.addEventListener('dragend', (e) => {
                        e.currentTarget.classList.remove('dragging');
                        document.querySelectorAll(`#${uniqueId} .locallora-lora-item.drag-over`).forEach(item => item.classList.remove('drag-over'));
                    });

                    el.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        const targetItem = e.currentTarget;
                        if(targetItem && targetItem.dataset.index !== draggedIndex) {
                           targetItem.classList.add('drag-over');
                        }
                    });

                    el.addEventListener('dragleave', (e) => {
                        e.currentTarget.classList.remove('drag-over');
                    });

                    el.addEventListener('drop', (e) => {
                        e.preventDefault();
                        const targetItem = e.currentTarget;
                        targetItem.classList.remove('drag-over');
                        const targetIndex = parseInt(targetItem.dataset.index);
                        
                        if (draggedIndex !== targetIndex) {
                            const [movedItem] = this.loraData.splice(draggedIndex, 1);
                            this.loraData.splice(targetIndex, 0, movedItem);
                            
                            updateSelection();
                            renderSelectedList();
                        }
                    });

                    selectedListEl.appendChild(el);
                });
            };

            const renderGallery = (append = false) => {
                if (!append) {
                    galleryEl.innerHTML = "";
                }

                const nameFilter = searchInput.value.toLowerCase();

                const lorasToRender = this.availableLoras.filter(lora => lora.name.toLowerCase().includes(nameFilter));

                const existingCardNames = new Set(
                    Array.from(galleryEl.querySelectorAll('.locallora-lora-card')).map(c => c.dataset.loraName)
                );

                lorasToRender.forEach(lora => {
                    if (append && existingCardNames.has(lora.name)) {
                        return;
                    }
                        const card = document.createElement("div");
                        card.className = "locallora-lora-card";
                        card.dataset.loraName = lora.name;
                        card.dataset.tags = lora.tags.join(',');
                        card.dataset.triggerWords = lora.trigger_words;
                        card.dataset.downloadUrl = lora.download_url;
                        card.title = lora.name;

                        let mediaHTML = '';
                        const empty_lora_image = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

                        if (lora.preview_type === 'video' && lora.preview_url) {
                            mediaHTML = `<video muted loop playsinline src="${lora.preview_url}"></video>`;
                        } else {
                            mediaHTML = `<img src="${lora.preview_url || empty_lora_image}">`;
                        }
                        
                        const linkBtnHTML = lora.download_url 
                            ? `<a href="${lora.download_url}" target="_blank" class="lora-card-link-btn" title="Open download page">🔗</a>` 
                            : '';

                        card.innerHTML = `
                            ${linkBtnHTML}
                            <div class="locallora-media-container">
                                ${mediaHTML}
                            </div>
                            <div class="locallora-lora-card-info">
                                <p>${lora.name}</p>
                                <div class="lora-card-triggers" title="${lora.trigger_words}">${lora.trigger_words || 'No triggers'}</div>
                                <div class="lora-card-tags"></div>
                            </div>
                            <div class="edit-tags-btn">✏️</div>
                        `;

                        if (lora.preview_type !== 'video') {
                            card.querySelector("img").onerror = (e) => { e.target.src = empty_lora_image; };
                        }
                        galleryEl.appendChild(card);
                        
                        const linkBtn = card.querySelector(".lora-card-link-btn");
                        if (linkBtn) {
                            linkBtn.addEventListener("click", (e) => e.stopPropagation());
                        }

                        if (this.loraData.some(item => item.lora === lora.name)) {
                            card.classList.add("selected-flow");
                        }
                        if (this.selectedCardsForEditing.has(card)) {
                            card.classList.add("selected-edit");
                        }

                        renderCardTags(card);
                        
                        if (lora.preview_type === 'video') {
                            const video = card.querySelector('video');
                            if (video) {
                                card.addEventListener('mouseenter', () => {
                                    video.play().catch(e => { /* Ignore errors from autoplay restrictions */ });
                                });
                                card.addEventListener('mouseleave', () => {
                                    video.pause();
                                    video.currentTime = 0;
                                });
                            }
                        }

                        card.addEventListener("click", () => {
                            const loraName = card.dataset.loraName;
                            const existingIndex = this.loraData.findIndex(item => item.lora === loraName);
                            if (existingIndex > -1) {
                                this.loraData.splice(existingIndex, 1);
                            } else {
                                this.loraData.push({ on: true, lora: loraName, strength: 1.0, strength_clip: 1.0 });
                            }
                            fetchAndRender(false);
                            renderSelectedList();
                            updateSelection();
                            updatePresetButtonText(null);
                        });

                        const editBtn = card.querySelector(".edit-tags-btn");
                        editBtn.addEventListener("click", (e) => {
                            e.stopPropagation();
                        
                            if (e.ctrlKey) {
                                if (this.selectedCardsForEditing.has(card)) {
                                    this.selectedCardsForEditing.delete(card);
                                    card.classList.remove("selected-edit");
                                } else {
                                    this.selectedCardsForEditing.add(card);
                                    card.classList.add("selected-edit");
                                }
                            } else {
                                if (this.selectedCardsForEditing.has(card) && this.selectedCardsForEditing.size === 1) {
                                    this.selectedCardsForEditing.clear();
                                    card.classList.remove("selected-edit");
                                } else {
                                    document.querySelectorAll(`#${uniqueId} .locallora-lora-card.selected-edit`).forEach(c => c.classList.remove("selected-edit"));
                                    this.selectedCardsForEditing.clear();
                                    
                                    this.selectedCardsForEditing.add(card);
                                    card.classList.add("selected-edit");
                                }
                            }
                        
                            renderMetadataEditor();
                        });
                });
            };
            
            const fetchAndRender = async (append = false) => {
                if (this.isLoading) return;

                const pageToFetch = append ? this.currentPage + 1 : 1;
                if (append && pageToFetch > this.totalPages) return;

                const tagFilter = tagFilterInput.value;
                const filterMode = tagFilterModeBtn.textContent;
                const folderFilter = folderFilterSelect.value;
                const selectedLoraNames = this.loraData.map(item => item.lora);

                const { loras, folders } = await LocalLoraGalleryNode.getLoras.call(this, tagFilter, filterMode, folderFilter, pageToFetch, selectedLoraNames); 

                if (append) {
                    const existingNames = new Set(this.availableLoras.map(l => l.name));
                    const newLoras = (loras || []).filter(l => !existingNames.has(l.name));
                    this.availableLoras = this.availableLoras.concat(newLoras);
                } else {
                    this.availableLoras = loras || [];
                    if (!foldersRendered && folders && folders.length > 0) {
                        renderFolders(folders);
                    }
                    galleryEl.scrollTop = 0;
                }

                renderGallery(append);
            };

            const handleTagSelectionChange = () => {
                const selectedTags = Array.from(multiSelectTagDropdown.querySelectorAll('input:checked')).map(cb => cb.value);
                tagFilterInput.value = selectedTags.join(',');
                saveStateAndFetch();
            };

            const loadAllTags = async () => {
                try {
                    const response = await api.fetchApi("/localloragallery/get_all_tags");
                    const data = await response.json();
                    multiSelectTagDropdown.innerHTML = '';
                    if (data.tags) {
                        data.tags.forEach(tag => {
                            const label = document.createElement('label');
                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.value = tag;
                            checkbox.addEventListener('change', handleTagSelectionChange);
                            label.appendChild(checkbox);
                            label.appendChild(document.createTextNode(` ${tag}`));
                            multiSelectTagDropdown.appendChild(label);
                        });
                    }
                } catch(e) { console.error("LocalLoraGallery: Failed to load all tags:", e); }
            };

            let foldersRendered = false;
            const renderFolders = (folders) => {
                if (foldersRendered) return;
                const currentVal = folderFilterSelect.value;
                folderFilterSelect.innerHTML = `<option value="">All Folders</option>`;
                folders.forEach(folder => {
                    const option = document.createElement('option');
                    option.value = folder;
                    option.textContent = folder === "." ? "Root" : folder.replaceAll('\\', '/');
                    folderFilterSelect.appendChild(option);
                });
                folderFilterSelect.value = currentVal;
                if (folders.length > 0) foldersRendered = true;
            };

            const renderPresets = (presets) => {
                presetDropdown.innerHTML = '';
                for (const name in presets) {
                    const presetLink = document.createElement('a');
                    presetLink.href = '#';
                    presetLink.dataset.presetName = name;

                    const nameSpan = document.createElement('span');
                    nameSpan.textContent = name;
                    presetLink.appendChild(nameSpan);

                    const deleteBtn = document.createElement('span');
                    deleteBtn.className = 'delete-preset-btn';
                    deleteBtn.textContent = '✖';
                    deleteBtn.title = 'Delete Preset';
                    deleteBtn.onclick = async (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        if (confirm(`Are you sure you want to delete preset "${name}"?`)) {
                            const res = await api.fetchApi("/localloragallery/delete_preset", {
                                method: "POST", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ name }),
                            });
                            const data = await res.json();
                            renderPresets(data.presets);
                        }
                    };
                    presetLink.appendChild(deleteBtn);
                    
                    presetLink.onclick = (e) => {
                        e.preventDefault();
                        this.loraData = JSON.parse(JSON.stringify(presets[name]));

                        renderSelectedList();

                        setTimeout(() => {
                            const HEADER_HEIGHT = 90;
                            const controlsEl = widgetContainer.querySelector(".locallora-controls");
                            const requiredTopHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;

                            if (mainContainer.classList.contains("gallery-collapsed")) {
                                this.size[1] = requiredTopHeight + HEADER_HEIGHT;
                            } else {
                                const galleryHeight = galleryEl.clientHeight;
                                const newTotalHeight = requiredTopHeight + galleryHeight + HEADER_HEIGHT;

                                if (newTotalHeight > this.size[1]) {
                                    this.size[1] = newTotalHeight;
                                    this.expandedHeight = newTotalHeight;
                                }
                            }
                            this.setDirtyCanvas(true, true);
                        }, 0);

                        updateSelection();
                        fetchAndRender(false);
                        presetDropdown.style.display = 'none';

                        updatePresetButtonText(name);
                    };
                    presetDropdown.appendChild(presetLink);
                }
            };
            
            const loadPresets = async () => {
                try {
                    const res = await api.fetchApi("/localloragallery/get_presets");
                    const presets = await res.json();
                    renderPresets(presets);
                } catch (e) { console.error("LocalLoraGallery: Failed to load presets", e); }
            };

            const renderMetadataEditor = () => {
                selectedCountEl.textContent = this.selectedCardsForEditing.size;

                if (this.selectedCardsForEditing.size === 0) {
                    metadataEditor.classList.remove("visible");
                    return;
                }

                tagEditorList.innerHTML = "";
                const allTags = Array.from(this.selectedCardsForEditing).map(card => card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : []);
                const commonTags = allTags.reduce((a, b) => a.filter(c => b.includes(c)));
                
                commonTags.forEach(tag => {
                    const tagEl = document.createElement("span");
                    tagEl.className = "tag";
                    tagEl.textContent = tag;
                    const removeEl = document.createElement("span");
                    removeEl.className = "remove-tag";
                    removeEl.textContent = "ⓧ";
                    removeEl.onclick = async (e) => {
                        e.stopPropagation();
                        const updatePromises = Array.from(this.selectedCardsForEditing).map(async (card) => {
                            const loraName = card.dataset.loraName;
                            const tags = card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : [];
                            const newTags = tags.filter(t => t !== tag);
                            
                            await LocalLoraGalleryNode.updateMetadata(loraName, { tags: newTags });

                            card.dataset.tags = newTags.join(',');
                            const loraInDataSource = this.availableLoras.find(lora => lora.name === loraName);
                            if (loraInDataSource) loraInDataSource.tags = newTags;
                            renderCardTags(card);
                        });
                        await Promise.all(updatePromises);
                        await loadAllTags();
                        renderMetadataEditor();
                    };
                    tagEl.appendChild(removeEl);
                    tagEditorList.appendChild(tagEl);
                });

                if (this.selectedCardsForEditing.size === 1) {
                    const selectedCard = Array.from(this.selectedCardsForEditing)[0];
                    triggerEditorInput.value = selectedCard.dataset.triggerWords || "";
                    triggerEditorRow.style.display = "flex";
                    urlEditorInput.value = selectedCard.dataset.downloadUrl || "";
                    urlEditorRow.style.display = "flex";
                } else {
                    triggerEditorRow.style.display = "none";
                    urlEditorRow.style.display = "none";
                }

                metadataEditor.classList.add("visible");
            };
            
            const renderCardTags = (card) => {
                const tagContainer = card.querySelector(".lora-card-tags");
                tagContainer.innerHTML = "";
                const tags = card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : [];
                tags.forEach(tag => {
                    const tagEl = document.createElement("span");
                    tagEl.className = "tag";
                    tagEl.textContent = tag;
                    tagEl.addEventListener("click", (e) => {
                        e.stopPropagation();
                        tagFilterInput.value = tag;
                        fetchAndRender();
                    });
                    tagContainer.appendChild(tagEl);
                });
            };
            
            this.initializeNode = async () => {
                let initialState = { 
                    is_collapsed: false, 
                    lora_stack: [],
                    filter_tag: "",
                    filter_mode: "OR",
                    filter_folder: ""
                };
                try {
                    const res = await api.fetchApi(`/localloragallery/get_ui_state?node_id=${this.id}&gallery_id=${this.properties.lora_gallery_unique_id}`);
                    const loadedState = await res.json();
                    initialState = { ...initialState, ...loadedState };
                } catch(e) { 
                    console.error("LocalLoraGallery: Failed to get initial UI state.", e); 
                }

                this.loraData = initialState.lora_stack || [];
                const selectionJson = JSON.stringify(this.loraData);
                this.setProperty("selection_data", selectionJson);
                const widget = this.widgets.find(w => w.name === "selection_data");
                if (widget) {
                    widget.value = selectionJson;
                }

                tagFilterInput.value = initialState.filter_tag;
                if (initialState.filter_mode === "AND") {
                    tagFilterModeBtn.textContent = "AND";
                    tagFilterModeBtn.style.backgroundColor = "#D97706";
                } else {
                    tagFilterModeBtn.textContent = "OR";
                    tagFilterModeBtn.style.backgroundColor = "#555";
                }
                
                await loadAllTags();
                await loadPresets();
                await fetchAndRender(); 

                let needs_refetch = false;
                if (initialState.filter_folder && folderFilterSelect.querySelector(`option[value="${initialState.filter_folder}"]`)) {
                    if (folderFilterSelect.value !== initialState.filter_folder) {
                        folderFilterSelect.value = initialState.filter_folder;
                        needs_refetch = true;
                    }
                }

                const selectedTags = new Set(initialState.filter_tag.split(',').filter(Boolean));
                multiSelectTagDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    cb.checked = selectedTags.has(cb.value);
                });

                renderSelectedList();
                
                if (initialState.is_collapsed) {
                    setTimeout(() => {
                        const controlsEl = widgetContainer.querySelector(".locallora-controls");
                        if (!controlsEl) return;
                        const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                        this.size[1] = contentHeight + HEADER_HEIGHT;
                        mainContainer.classList.add("gallery-collapsed");
                        toggleGalleryBtn.textContent = "Show Gallery";
                        this.setDirtyCanvas(true, true);
                    }, 0);
                }

                if (needs_refetch) {
                    await fetchAndRender();
                }
            };

            this.expandedHeight = this.size[1];

            const bindEventListeners = () => {
                document.addEventListener("keydown", (e) => {
                    if (e.key === "Escape") {
                        if (this.selectedCardsForEditing.size > 0) {
                            document.querySelectorAll(`#${uniqueId} .locallora-lora-card.selected-edit`).forEach(c => c.classList.remove("selected-edit"));
                            this.selectedCardsForEditing.clear();
                            renderMetadataEditor();
                        }
                    }
                });

                urlEditorInput.addEventListener("keydown", async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (this.selectedCardsForEditing.size !== 1) return;

                        const selectedCard = Array.from(this.selectedCardsForEditing)[0];
                        const loraName = selectedCard.dataset.loraName;
                        const newUrl = urlEditorInput.value.trim();

                        await LocalLoraGalleryNode.updateMetadata(loraName, { download_url: newUrl });

                        selectedCard.dataset.downloadUrl = newUrl;
                        const loraInDataSource = this.availableLoras.find(l => l.name === loraName);
                        if (loraInDataSource) loraInDataSource.download_url = newUrl;
                        
                        let linkBtn = selectedCard.querySelector('.lora-card-link-btn');
                        if (newUrl) {
                            if (!linkBtn) {
                                linkBtn = document.createElement('a');
                                linkBtn.className = 'lora-card-link-btn';
                                linkBtn.title = 'Open download page';
                                linkBtn.innerHTML = '🔗';
                                linkBtn.target = '_blank';
                                linkBtn.addEventListener("click", (e) => e.stopPropagation());
                                selectedCard.prepend(linkBtn);
                            }
                            linkBtn.href = newUrl;
                        } else if (linkBtn) {
                            linkBtn.remove();
                        }

                        const originalColor = urlEditorInput.style.backgroundColor;
                        urlEditorInput.style.backgroundColor = "#2a5";
                        setTimeout(() => { urlEditorInput.style.backgroundColor = ""; }, 500);
                    }
                });

                triggerEditorInput.addEventListener("keydown", async (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        if (this.selectedCardsForEditing.size !== 1) return;

                        const selectedCard = Array.from(this.selectedCardsForEditing)[0];
                        const loraName = selectedCard.dataset.loraName;
                        const newTriggers = triggerEditorInput.value.trim();

                        await LocalLoraGalleryNode.updateMetadata(loraName, { trigger_words: newTriggers });

                        selectedCard.dataset.triggerWords = newTriggers;
                        const loraInDataSource = this.availableLoras.find(l => l.name === loraName);
                        if (loraInDataSource) loraInDataSource.trigger_words = newTriggers;
                        
                        const triggerDisplayEl = selectedCard.querySelector('.lora-card-triggers');
                        if(triggerDisplayEl) {
                            triggerDisplayEl.textContent = newTriggers || 'No triggers';
                            triggerDisplayEl.title = newTriggers;
                        }
                        
                        const originalColor = triggerEditorInput.style.backgroundColor;
                        triggerEditorInput.style.backgroundColor = "#2a5";
                        setTimeout(() => { triggerEditorInput.style.backgroundColor = ""; }, 500);
                    }
                });
                
                tagEditorInput.addEventListener("keydown", async (e) => {
                    if (e.key === 'Enter' && tagEditorInput.value.trim()) {
                        e.preventDefault();
                        const newTag = tagEditorInput.value.trim();
                        if (newTag) {
                            const updatePromises = Array.from(this.selectedCardsForEditing).map(async (card) => {
                                const loraName = card.dataset.loraName;
                                const tags = card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : [];
                                
                                if (!tags.includes(newTag)) {
                                    tags.push(newTag);
                                    await LocalLoraGalleryNode.updateMetadata(loraName, { tags: tags });
                                    card.dataset.tags = tags.join(',');
                                    const loraInDataSource = this.availableLoras.find(lora => lora.name === loraName);
                                    if (loraInDataSource) loraInDataSource.tags = [...tags];
                                    renderCardTags(card);
                                }
                            });
                            await Promise.all(updatePromises);
                            await loadAllTags();
                            renderMetadataEditor();
                            e.target.value = "";
                        }
                    }
                });

                clearTagFilterBtn.addEventListener("click", () => {
                    tagFilterInput.value = "";
                    multiSelectTagDropdown.querySelectorAll('input:checked').forEach(cb => cb.checked = false);
                    saveStateAndFetch();
                });

                widgetContainer.querySelector(".clear-all-btn").addEventListener("click", () => {
                    this.loraData = [];
                    if (mainContainer.classList.contains("gallery-collapsed")) {
                        setTimeout(() => {
                            const controlsEl = widgetContainer.querySelector(".locallora-controls");
                            if (!controlsEl) return;
                            const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                            this.size[1] = contentHeight + HEADER_HEIGHT;
                            this.setDirtyCanvas(true, true);
                        }, 0);
                    }
                    fetchAndRender(false);
                    renderSelectedList();
                    updateSelection();
                    updatePresetButtonText(null);
                });
                
                folderFilterSelect.addEventListener("change", saveStateAndFetch);

                tagFilterModeBtn.addEventListener("click", () => {
                    if (tagFilterModeBtn.textContent === "OR") {
                        tagFilterModeBtn.textContent = "AND";
                        tagFilterModeBtn.style.backgroundColor = "#D97706";
                    } else {
                        tagFilterModeBtn.textContent = "OR";
                        tagFilterModeBtn.style.backgroundColor = "#555";
                    }
                    saveStateAndFetch();
                });
              
                savePresetBtn.addEventListener("click", async () => {
                    const presetName = prompt("Enter a name for this preset:", "");
                    if (presetName && this.loraData.length > 0) {
                        const res = await api.fetchApi("/localloragallery/save_preset", {
                            method: "POST", headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: presetName, data: this.loraData }),
                        });
                        const data = await res.json();
                        renderPresets(data.presets);
                    }
                });

                loadPresetBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    presetDropdown.style.display = presetDropdown.style.display === 'block' ? 'none' : 'block';
                });

                toggleGalleryBtn.addEventListener("click", () => {
                    const isCollapsing = !mainContainer.classList.contains("gallery-collapsed");
                    
                    if (isCollapsing) {
                        this.expandedHeight = this.size[1];
                        const controlsEl = widgetContainer.querySelector(".locallora-controls");
                        const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                        this.size[1] = contentHeight + HEADER_HEIGHT;
                        mainContainer.classList.add("gallery-collapsed");
                        toggleGalleryBtn.textContent = "Show Gallery";
                    } else {
                        this.size[1] = this.expandedHeight;
                        mainContainer.classList.remove("gallery-collapsed");
                        toggleGalleryBtn.textContent = "Hide Gallery";
                    }
                    
                    LocalLoraGalleryNode.setUiState(this.id, this.properties.lora_gallery_unique_id, { 
                        is_collapsed: isCollapsing,
                        lora_stack: this.loraData.map(({ element, ...rest }) => rest)
                    });
                    app.graph.setDirty(true);
                });

                widgetContainer.querySelector(".toggle-all-btn").addEventListener("click", () => {
                    const allOn = this.loraData.every(item => item.on);
                    this.loraData.forEach(item => item.on = !allOn);
                    renderSelectedList();
                    updateSelection();
                });

                searchInput.addEventListener("input", renderGallery);
                tagFilterInput.addEventListener("keydown", (e) => { if(e.key === 'Enter') saveStateAndFetch(); });
                
                const arrow = multiSelectTagContainer.querySelector('.locallora-multiselect-arrow');
                multiSelectTagDisplay.addEventListener('click', () => {
                    const isVisible = multiSelectTagDropdown.style.display === 'block';
                    multiSelectTagDropdown.style.display = isVisible ? 'none' : 'block';
                    arrow.classList.toggle('open', !isVisible);
                });

                document.addEventListener('click', (e) => {
                    if (!multiSelectTagContainer.contains(e.target)) {
                        multiSelectTagDropdown.style.display = 'none';
                        arrow.classList.remove('open');
                    }
                    if (!loadPresetBtn.contains(e.target)) {
                        presetDropdown.style.display = 'none';
                    }
                });
            };

            this.onResize = function(size) {
                const controlsEl = widgetContainer.querySelector(".locallora-controls");
                const dynamicMinHeight = selectedListEl.scrollHeight + (controlsEl?.offsetHeight || 0) + HEADER_HEIGHT;
                if (!mainContainer.classList.contains("gallery-collapsed")) {
                    this.expandedHeight = size[1];
                }
                if (size[1] < dynamicMinHeight) size[1] = dynamicMinHeight;
                if (size[0] < MIN_NODE_WIDTH) size[0] = MIN_NODE_WIDTH;
            };

            bindEventListeners();
            setTimeout(() => this.initializeNode(), 1);

            return result;
        };
    }
};

app.registerExtension({
    name: "LocalLoraGallery.GalleryUI",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name === "LocalLoraGallery" || nodeData.name === "LocalLoraGalleryModelOnly") {
            LocalLoraGalleryNode.setup(nodeType, nodeData);
        }
    },
});