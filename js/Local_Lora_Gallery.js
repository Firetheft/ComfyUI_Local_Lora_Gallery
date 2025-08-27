import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const LocalLoraGalleryNode = {
    name: "LocalLoraGallery",
    
    async getLoras(filter_tag = "", mode = "OR") {
        try {
            const response = await api.fetchApi(`/localloragallery/get_loras?filter_tag=${encodeURIComponent(filter_tag)}&mode=${mode}`);
            return await response.json();
        } catch (error) {
            console.error("LocalLoraGallery: Error fetching LoRAs:", error);
            return [];
        }
    },

    async updateMetadata(lora_name, tags) {
        try {
            await api.fetchApi("/localloragallery/update_metadata", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lora_name, tags }),
            });
        } catch(e) {
            console.error("LocalLoraGallery: Failed to update metadata", e);
        }
    },

    async setUiState(nodeId, state) {
        try {
            await api.fetchApi("/localloragallery/set_ui_state", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ node_id: nodeId, state: state }),
            });
        } catch(e) {
            console.error("LocalLoraGallery: Failed to set UI state", e);
        }
    },

    setup(nodeType, nodeData) {
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            
            const HEADER_HEIGHT = 75;
            const MIN_NODE_WIDTH = 600;

            this.size = [700, 600];
            this.loraData = [];
            this.availableLoras = [];
            this.isModelOnly = nodeData.name.includes("ModelOnly");
            this.selectedCardsForEditing = new Set(); 

            const widgetContainer = document.createElement("div");
            widgetContainer.className = "locallora-container-wrapper";
            this.addDOMWidget("gallery", "div", widgetContainer, {});

            const uniqueId = `locallora-gallery-${this.id}`;
            widgetContainer.innerHTML = `
                <style>
                    /* ... [Your existing styles remain unchanged] ... */
                    #${uniqueId} .locallora-container { display: flex; flex-direction: column; height: 100%; font-family: sans-serif; }
                    #${uniqueId} .locallora-selected-list { flex-shrink: 0; padding: 5px; background-color: #22222200; max-height: 100%; }
                    #${uniqueId} .locallora-lora-item { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
                    #${uniqueId} .locallora-lora-item .lora-name { flex-grow: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 12px; }
                    #${uniqueId} .locallora-lora-item input[type=number] { width: 60px; background-color: #333; border: 1px solid #555; border-radius: 4px; color: #ccc; }
                    #${uniqueId} .locallora-lora-item .lora-label { font-size: 10px; color: var(--node-text-color); }
                    #${uniqueId} .locallora-controls { display: flex; flex-direction: column; padding: 5px; gap: 5px; flex-shrink: 0; }
                    #${uniqueId} .locallora-controls-row { display: flex; gap: 10px; align-items: center; }
                    #${uniqueId} .locallora-gallery { flex-grow: 1; overflow-y: auto; background-color: #1a1a1a; padding: 5px; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; align-content: start; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar { width: 8px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-track { background: #2a2a2a; border-radius: 4px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-thumb { background-color: #555; border-radius: 4px; }
                    #${uniqueId} .locallora-gallery::-webkit-scrollbar-thumb:hover { background-color: #777; }                    
                    #${uniqueId} .locallora-lora-card { cursor: pointer; border: 3px solid transparent; border-radius: 8px; background-color: var(--comfy-input-bg); transition: border-color 0.2s; display: flex; flex-direction: column; position: relative; }
                    #${uniqueId} .locallora-lora-card.selected-edit { border-color: #FFD700; box-shadow: 0 0 10px #FFD700; }
                    #${uniqueId} .locallora-lora-card.selected-flow { border-color: #00FFC9; }
                    #${uniqueId} .locallora-lora-card img { width: 100%; height: 150px; object-fit: cover; border-top-left-radius: 5px; border-top-right-radius: 5px; background-color: #111; }
                    #${uniqueId} .locallora-lora-card-info { padding: 4px; flex-grow: 1; display: flex; flex-direction: column; }
                    #${uniqueId} .locallora-lora-card p { font-size: 11px; margin: 0; word-break: break-all; text-align: center; color: var(--node-text-color); }
                    #${uniqueId} .lora-card-tags { display: flex; flex-wrap: wrap; gap: 3px; margin-top: auto; padding-top: 4px; }
                    #${uniqueId} .lora-card-tags .tag { background-color: #006699; color: #fff; padding: 1px 4px; font-size: 10px; border-radius: 3px; cursor: pointer; }
                    #${uniqueId} .lora-card-tags .tag:hover { background-color: #0088CC; }
                    #${uniqueId} .locallora-tag-editor { display: none; }
                    #${uniqueId} .locallora-tag-editor.visible { display: flex; }
                    #${uniqueId} .tag-editor-list .tag .remove-tag { margin-left: 4px; color: #fdd; cursor: pointer; font-weight: bold; }
                    #${uniqueId} .edit-tags-btn { position: absolute; bottom: 4px; right: 4px; width: 22px; height: 22px; background-color: rgba(0,0,0,0.5); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; transition: background-color 0.2s; opacity: 0; }
                    #${uniqueId} .locallora-lora-card:hover .edit-tags-btn { opacity: 1; }
                    #${uniqueId} .edit-tags-btn:hover { background-color: rgba(0,0,0,0.8); }
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
                </style>
                <div id="${uniqueId}" style="height: 100%;">
                    <div class="locallora-container">
                        <div class="locallora-selected-list"></div>
                        <div class="locallora-controls">
                            <div class="locallora-controls-row">
                                <button class="toggle-all-btn">Toggle All</button>
                                <input type="text" class="search-input" placeholder="Filter by Name..." style="flex-grow: 1; background: #222; color: #ccc; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                                <button class="clear-all-btn" title="Clear all selected LoRAs">Clear All</button>
                            </div>
                            <div class="locallora-controls-row locallora-tag-editor">
                                <label style="font-size:12px;">Edit Tags (<span class="selected-count">0</span>):</label>
                                <div class="tag-editor-list lora-card-tags" style="flex-grow:1;"></div>
                                <input type="text" class="tag-editor-input" placeholder="Add tag..." style="width: 100px; background: #222; color: #ccc; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                            </div>
                            <div class="locallora-controls-row">
                                <button class="tag-filter-mode-btn" title="Click to switch filter mode">OR</button>
                                <input type="text" class="tag-filter-input" placeholder="Filter by Tag..." style="flex-grow: 1; background: #222; color: #ccc; border: 1px solid #555; padding: 4px; border-radius: 4px;">
                                <button class="clear-tag-filter-btn" title="Clear Tag Filter">✖</button>
                                <select class="tag-filter-presets" style="background: #222; color: #ccc; border: 1px solid #555;"></select>
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
            const tagEditor = widgetContainer.querySelector(".locallora-tag-editor");
            const tagEditorList = widgetContainer.querySelector(".tag-editor-list");
            const tagEditorInput = widgetContainer.querySelector(".tag-editor-input");
            const tagFilterInput = widgetContainer.querySelector(".tag-filter-input");
            const tagFilterPresets = widgetContainer.querySelector(".tag-filter-presets");
            const tagFilterModeBtn = widgetContainer.querySelector(".tag-filter-mode-btn");
            const toggleGalleryBtn = widgetContainer.querySelector(".toggle-gallery-btn");
            const selectedCountEl = widgetContainer.querySelector(".selected-count");

            const sortAndPinLoras = () => {
                const selectedNames = new Set(this.loraData.map(item => item.lora));
                this.availableLoras.sort((a, b) => {
                    const aSelected = selectedNames.has(a.name);
                    const bSelected = selectedNames.has(b.name);
                    if (aSelected && !bSelected) return -1;
                    if (!aSelected && bSelected) return 1;
                    return a.name.localeCompare(b.name);
                });
            };

            const updateSelection = () => {
                const serializableData = this.loraData.map(({ element, ...rest }) => rest);
                api.fetchApi("/localloragallery/set_selection", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ node_id: this.id, lora_stack: serializableData }),
                }).catch(e => console.error("LocalLoraGallery: Failed to send selection to backend:", e));
            };
            
            const renderSelectedList = () => {
                selectedListEl.innerHTML = "";
                this.loraData.forEach((item, index) => {
                    const el = document.createElement("div");
                    el.className = "locallora-lora-item";
                    
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
                        sortAndPinLoras();
                        renderGallery();
                    });
                    el.appendChild(removeBtn);

                    selectedListEl.appendChild(el);
                });
            };

            const renderGallery = () => {
                galleryEl.innerHTML = "";
                const nameFilter = searchInput.value.toLowerCase();
                this.availableLoras
                    .filter(lora => lora.name.toLowerCase().includes(nameFilter))
                    .forEach(lora => {
                        const card = document.createElement("div");
                        card.className = "locallora-lora-card";
                        card.dataset.loraName = lora.name;
                        card.dataset.tags = lora.tags.join(',');
                        card.title = lora.name;
                        card.innerHTML = `
                            <img src="${lora.preview_url || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}">
                            <div class="locallora-lora-card-info">
                                <p>${lora.name}</p>
                                <div class="lora-card-tags"></div>
                            </div>
                            <div class="edit-tags-btn">✏️</div>
                        `;
                        card.querySelector("img").onerror = (e) => { e.target.style.display = 'none'; };
                        galleryEl.appendChild(card);
                        
                        if (this.loraData.some(item => item.lora === lora.name)) {
                            card.classList.add("selected-flow");
                        }
                        if (this.selectedCardsForEditing.has(card)) {
                            card.classList.add("selected-edit");
                        }

                        renderCardTags(card);
                        
                        card.addEventListener("click", () => {
                            const loraName = card.dataset.loraName;
                            const existingIndex = this.loraData.findIndex(item => item.lora === loraName);
                            if (existingIndex > -1) {
                                this.loraData.splice(existingIndex, 1);
                            } else {
                                this.loraData.push({ on: true, lora: loraName, strength: 1.0, strength_clip: 1.0 });
                            }
                            sortAndPinLoras();
                            renderGallery();
                            renderSelectedList();
                            updateSelection();
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
                        
                            renderTagEditor();
                        });
                });
            };
            
            const fetchAndRender = async () => {
                const tagFilter = tagFilterInput.value;
                const filterMode = tagFilterModeBtn.textContent;
                this.availableLoras = await LocalLoraGalleryNode.getLoras(tagFilter, filterMode); 
                sortAndPinLoras();
                renderGallery();
            };

            const loadAllTags = async () => {
                try {
                    const response = await api.fetchApi("/localloragallery/get_all_tags");
                    const data = await response.json();
                    tagFilterPresets.innerHTML = '<option value="">Select a Tag</option>';
                    if (data.tags) {
                        data.tags.forEach(tag => {
                            const option = new Option(tag, tag);
                            tagFilterPresets.add(option);
                        });
                    }
                } catch(e) { console.error("LocalLoraGallery: Failed to load all tags:", e); }
            };

            const renderTagEditor = () => {
                tagEditorList.innerHTML = "";
                selectedCountEl.textContent = this.selectedCardsForEditing.size;

                if (this.selectedCardsForEditing.size === 0) {
                    tagEditor.classList.remove("visible");
                    return;
                }

                const allTags = Array.from(this.selectedCardsForEditing).map(card => {
                    return card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : [];
                });

                const commonTags = allTags.reduce((acc, tags) => acc.filter(tag => tags.includes(tag)));

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
                            card.dataset.tags = newTags.join(',');

                            const loraInDataSource = this.availableLoras.find(lora => lora.name === loraName);
                            if (loraInDataSource) {
                                loraInDataSource.tags = newTags;
                            }

                            await LocalLoraGalleryNode.updateMetadata(loraName, newTags);
                        });

                        await Promise.all(updatePromises);
                        
                        this.selectedCardsForEditing.clear();
                        
                        await loadAllTags();
                        renderTagEditor();

                        if (tagFilterInput.value.trim()) {
                            await fetchAndRender();
                        } else {
                            renderGallery();
                        }
                    };
                    tagEl.appendChild(removeEl);
                    tagEditorList.appendChild(tagEl);
                });

                tagEditor.classList.add("visible");
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
                let initialState = { is_collapsed: false };
                try {
                    const res = await api.fetchApi(`/localloragallery/get_ui_state?node_id=${this.id}`);
                    initialState = await res.json();
                } catch(e) { console.error("LocalLoraGallery: Failed to get initial UI state.", e); }

                try {
                    const res = await api.fetchApi(`/localloragallery/get_selection?node_id=${this.id}`);
                    const data = await res.json();
                    if (data.lora_stack) { this.loraData = data.lora_stack; }
                } catch (e) { this.loraData = []; }

                await loadAllTags();
                const tagFilter = tagFilterInput.value;
                this.availableLoras = await LocalLoraGalleryNode.getLoras(tagFilter);
                
                sortAndPinLoras();
                renderGallery();
                renderSelectedList();
                
                if (initialState.is_collapsed) {
                    setTimeout(() => {
                        const controlsEl = widgetContainer.querySelector(".locallora-controls");
                        if (!controlsEl) {
                            console.error("LocalLoraGallery: Could not find controls element for size calculation.");
                            return;
                        }
                        const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                        this.size[1] = contentHeight + HEADER_HEIGHT;
                        mainContainer.classList.add("gallery-collapsed");
                        toggleGalleryBtn.textContent = "Show Gallery";
                        this.setDirtyCanvas(true, true);
                    }, 0);
                }
            };

            this.expandedHeight = this.size[1];

            const bindEventListeners = () => {
                document.addEventListener("keydown", (e) => {
                    if (e.key === "Escape") {
                        if (this.selectedCardsForEditing.size > 0) {
                            document.querySelectorAll(`#${uniqueId} .locallora-lora-card.selected-edit`).forEach(c => c.classList.remove("selected-edit"));
                            this.selectedCardsForEditing.clear();
                            renderTagEditor();
                        }
                    }
                });

                widgetContainer.querySelector(".clear-tag-filter-btn").addEventListener("click", () => {
                    tagFilterInput.value = "";
                    fetchAndRender();
                });

                widgetContainer.querySelector(".clear-all-btn").addEventListener("click", () => {
                    this.loraData = [];
                    if (mainContainer.classList.contains("gallery-collapsed")) {
                        setTimeout(() => {
                            const controlsEl = widgetContainer.querySelector(".locallora-controls");
                            if (!controlsEl) {
                                console.error("LocalLoraGallery: Could not find controls element for size calculation.");
                                return;
                            }
                            const contentHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight;
                            this.size[1] = contentHeight + HEADER_HEIGHT;
                            this.setDirtyCanvas(true, true);
                        }, 0);
                    }
                    sortAndPinLoras();
                    renderGallery();
                    renderSelectedList();
                    updateSelection();
                });
                
                tagFilterModeBtn.addEventListener("click", () => {
                    if (tagFilterModeBtn.textContent === "OR") {
                        tagFilterModeBtn.textContent = "AND";
                        tagFilterModeBtn.style.backgroundColor = "#D97706";
                    } else {
                        tagFilterModeBtn.textContent = "OR";
                        tagFilterModeBtn.style.backgroundColor = "#555";
                    }
                    fetchAndRender();
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
                    
                    LocalLoraGalleryNode.setUiState(this.id, { is_collapsed: isCollapsing });
                    app.graph.setDirty(true);
                });

                widgetContainer.querySelector(".toggle-all-btn").addEventListener("click", () => {
                    const allOn = this.loraData.every(item => item.on);
                    this.loraData.forEach(item => item.on = !allOn);
                    renderSelectedList();
                    updateSelection();
                });

                searchInput.addEventListener("input", renderGallery);
                tagFilterInput.addEventListener("keydown", (e) => { if(e.key === 'Enter') fetchAndRender(); });
                tagEditorInput.addEventListener("keydown", async (e) => {
                    if (e.key === 'Enter' && this.selectedCardsForEditing.size > 0) {
                        e.preventDefault();
                        const newTag = e.target.value.trim();
                        if (newTag) {
                            const updatePromises = Array.from(this.selectedCardsForEditing).map(async (card) => {
                                const loraName = card.dataset.loraName;
                                const tags = card.dataset.tags ? card.dataset.tags.split(',').filter(Boolean) : [];
                                
                                if (!tags.includes(newTag)) {
                                    tags.push(newTag);
                                    card.dataset.tags = tags.join(',');
                                    await LocalLoraGalleryNode.updateMetadata(loraName, tags);

                                    const loraInDataSource = this.availableLoras.find(lora => lora.name === loraName);
                                    if (loraInDataSource) {
                                        loraInDataSource.tags = [...tags];
                                    }
                                    renderCardTags(card);
                                }
                            });

                            await Promise.all(updatePromises);
                            await loadAllTags();
                            renderTagEditor();
                            e.target.value = "";
                        }
                    }
                });
                tagFilterPresets.addEventListener('change', () => {
                    if (tagFilterPresets.value) {
                        tagFilterInput.value = tagFilterPresets.value;
                        fetchAndRender();
                        tagFilterPresets.value = "";
                    }
                });
            };

            this.onResize = function(size) {
                const controlsEl = widgetContainer.querySelector(".locallora-controls");

                const dynamicMinHeight = selectedListEl.scrollHeight + controlsEl.offsetHeight + HEADER_HEIGHT;

                if (!mainContainer.classList.contains("gallery-collapsed")) {
                    this.expandedHeight = size[1];
                }

                if (size[1] < dynamicMinHeight) {
                    size[1] = dynamicMinHeight;
                }

                if (size[0] < MIN_NODE_WIDTH) {
                    size[0] = MIN_NODE_WIDTH;
                }
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