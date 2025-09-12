import os
import json
import folder_paths
import server
from aiohttp import web
from nodes import LoraLoader, LoraLoaderModelOnly
import urllib.parse

NunchakuFluxLoraLoader = None
is_nunchaku_available = False
try:
    from nodes import NODE_CLASS_MAPPINGS
    if "NunchakuFluxLoraLoader" in NODE_CLASS_MAPPINGS:
        NunchakuFluxLoraLoader = NODE_CLASS_MAPPINGS["NunchakuFluxLoraLoader"]
        is_nunchaku_available = True
        print("✅ Local Lora Gallery: Nunchaku integration enabled.")
except Exception as e:
    print(f"INFO: Local Lora Gallery - Nunchaku nodes not found. Running in standard mode. Error: {e}")

NODE_DIR = os.path.dirname(os.path.abspath(__file__))
METADATA_FILE = os.path.join(NODE_DIR, "lora_gallery_metadata.json")
UI_STATE_FILE = os.path.join(NODE_DIR, "lora_gallery_ui_state.json")
PRESETS_FILE = os.path.join(NODE_DIR, "lora_gallery_presets.json")
VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi']
IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

def load_json_file(file_path, default_data={}):
    if not os.path.exists(file_path):
        return default_data
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content:
                return default_data
            return json.loads(content)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return default_data

def save_json_file(data, file_path):
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving {file_path}: {e}")

load_metadata = lambda: load_json_file(METADATA_FILE)
save_metadata = lambda data: save_json_file(data, METADATA_FILE)
load_ui_state = lambda: load_json_file(UI_STATE_FILE)
save_ui_state = lambda data: save_json_file(data, UI_STATE_FILE)
load_presets = lambda: load_json_file(PRESETS_FILE)
save_presets = lambda data: save_json_file(data, PRESETS_FILE)

def get_lora_preview_asset(lora_name):
    """Finds a preview asset (image or video) for a given LoRA."""
    lora_path = folder_paths.get_full_path("loras", lora_name)
    if lora_path is None:
        return None
    base_name, _ = os.path.splitext(lora_path)

    for ext in IMAGE_EXTENSIONS + VIDEO_EXTENSIONS:
        if os.path.exists(base_name + ext):
            return os.path.basename(base_name + ext)
    return None

@server.PromptServer.instance.routes.get("/localloragallery/get_presets")
async def get_presets(request):
    presets = load_presets()
    return web.json_response(presets)

@server.PromptServer.instance.routes.post("/localloragallery/save_preset")
async def save_preset(request):
    try:
        data = await request.json()
        preset_name = data.get("name")
        preset_data = data.get("data")
        if not preset_name or not preset_data:
            return web.json_response({"status": "error", "message": "Missing preset name or data"}, status=400)
        
        presets = load_presets()
        presets[preset_name] = preset_data
        save_presets(presets)
        return web.json_response({"status": "ok", "presets": presets})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/localloragallery/delete_preset")
async def delete_preset(request):
    try:
        data = await request.json()
        preset_name = data.get("name")
        if not preset_name:
            return web.json_response({"status": "error", "message": "Missing preset name"}, status=400)
        
        presets = load_presets()
        if preset_name in presets:
            del presets[preset_name]
            save_presets(presets)
        return web.json_response({"status": "ok", "presets": presets})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/localloragallery/get_loras")
async def get_loras_endpoint(request):
    try:
        filter_tags_str = request.query.get('filter_tag', '').strip().lower()
        filter_tags = [tag.strip() for tag in filter_tags_str.split(',') if tag.strip()]
        filter_mode = request.query.get('mode', 'OR').upper()
        filter_folder = request.query.get('folder', '').strip()
        selected_loras = request.query.getall('selected_loras', [])
        
        page = int(request.query.get('page', 1))
        per_page = int(request.query.get('per_page', 50))

        lora_files = folder_paths.get_filename_list("loras")
        loras_root = folder_paths.get_folder_paths("loras")[0]
        metadata = load_metadata()
        all_folders = set()

        filtered_loras = []
        for lora in lora_files:
            lora_full_path = folder_paths.get_full_path("loras", lora)
            if not lora_full_path: continue

            relative_path = os.path.relpath(os.path.dirname(lora_full_path), loras_root)
            folder = "." if relative_path == "." else relative_path
            all_folders.add(folder)

            if filter_folder and filter_folder != folder:
                continue

            lora_meta = metadata.get(lora, {})
            tags = [t.lower() for t in lora_meta.get('tags', [])]

            if filter_tags:
                if filter_mode == 'AND':
                    if not all(ft in tags for ft in filter_tags):
                        continue
                else:
                    if not any(ft in tags for ft in filter_tags):
                        continue
            
            filtered_loras.append(lora)

        pinned_items_dict = {name: None for name in selected_loras}
        remaining_items = []
        for lora in filtered_loras:
            if lora in pinned_items_dict:
                pinned_items_dict[lora] = lora
            else:
                remaining_items.append(lora)

        pinned_items = [lora for lora in selected_loras if pinned_items_dict.get(lora)]

        remaining_items.sort(key=lambda x: x.lower())
        final_lora_list = pinned_items + remaining_items

        total_loras = len(final_lora_list)
        total_pages = (total_loras + per_page - 1) // per_page
        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        paginated_loras = final_lora_list[start_index:end_index]

        lora_info_list = []
        for lora in paginated_loras:
            lora_meta = metadata.get(lora, {})
            preview_filename = get_lora_preview_asset(lora)
            preview_url = ""
            preview_type = "none"

            if preview_filename:
                _, ext = os.path.splitext(preview_filename)
                if ext.lower() in VIDEO_EXTENSIONS:
                    preview_type = "video"
                elif ext.lower() in IMAGE_EXTENSIONS:
                    preview_type = "image"
                
                encoded_lora_name = urllib.parse.quote(lora)
                preview_url = f"/localloragallery/preview?filename={preview_filename}&lora_name={encoded_lora_name}"
            
            lora_info_list.append({
                "name": lora,
                "preview_url": preview_url,
                "preview_type": preview_type,
                "tags": lora_meta.get('tags', []),
                "trigger_words": lora_meta.get('trigger_words', ''),
                "download_url": lora_meta.get('download_url', ''),
            })

        sorted_folders = sorted(list(all_folders), key=lambda s: s.lower())
        
        return web.json_response({
            "loras": lora_info_list, 
            "folders": sorted_folders,
            "total_pages": total_pages,
            "current_page": page
        })
    except Exception as e:
        import traceback
        print(f"Error in get_loras_endpoint: {traceback.format_exc()}")
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/localloragallery/preview")
async def get_preview_image(request):
    filename = request.query.get('filename')
    lora_name = request.query.get('lora_name')
    if not filename or not lora_name or ".." in filename or "/" in filename or "\\" in filename:
        return web.Response(status=403)
    try:
        lora_full_path = folder_paths.get_full_path("loras", lora_name)
        if not lora_full_path:
            return web.Response(status=404)
        image_path = os.path.join(os.path.dirname(lora_full_path), filename)
        return web.FileResponse(image_path) if os.path.exists(image_path) else web.Response(status=404)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/localloragallery/set_ui_state")
async def set_ui_state(request):
    try:
        data = await request.json()
        node_id = str(data.get("node_id"))
        gallery_id = data.get("gallery_id")
        state = data.get("state", {})

        if not gallery_id: return web.Response(status=400)

        node_key = f"{gallery_id}_{node_id}"
        ui_states = load_ui_state()
        if node_key not in ui_states:
            ui_states[node_key] = {}
        ui_states[node_key].update(state)
        save_ui_state(ui_states)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/localloragallery/get_ui_state")
async def get_ui_state(request):
    try:
        node_id = request.query.get('node_id')
        gallery_id = request.query.get('gallery_id')

        if not node_id or not gallery_id:
            return web.json_response({"error": "node_id or gallery_id is required"}, status=400)

        node_key = f"{gallery_id}_{node_id}"
        ui_states = load_ui_state()
        node_state = ui_states.get(node_key, {"is_collapsed": False})
        return web.json_response(node_state)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/localloragallery/update_metadata")
async def update_lora_metadata(request):
    try:
        data = await request.json()
        lora_name = data.get("lora_name")
        tags = data.get("tags")
        trigger_words = data.get("trigger_words")
        download_url = data.get("download_url")

        if not lora_name:
            return web.json_response({"status": "error", "message": "Missing lora_name"}, status=400)
        
        metadata = load_metadata()
        if lora_name not in metadata:
            metadata[lora_name] = {}
        
        if tags is not None:
            metadata[lora_name]['tags'] = [str(tag).strip() for tag in tags if str(tag).strip()]
        
        if trigger_words is not None:
            metadata[lora_name]['trigger_words'] = str(trigger_words)

        if download_url is not None:
            metadata[lora_name]['download_url'] = str(download_url)

        save_metadata(metadata)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)
    
@server.PromptServer.instance.routes.get("/localloragallery/get_all_tags")
async def get_all_tags(request):
    try:
        metadata = load_metadata()
        all_tags = set(tag for item_meta in metadata.values() if isinstance(item_meta.get("tags"), list) for tag in item_meta["tags"])
        return web.json_response({"tags": sorted(list(all_tags), key=lambda s: s.lower())})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

class BaseLoraGallery:
    """Base class for common functionality."""
    
    @classmethod
    def IS_CHANGED(cls, selection_data, **kwargs):
        return selection_data

    def _is_nunchaku_model(self, model):
        """Checks if the model is a Nunchaku-accelerated model."""
        if not is_nunchaku_available:
            return False
        return hasattr(model.model, 'diffusion_model') and model.model.diffusion_model.__class__.__name__ == 'ComfyFluxWrapper'

class LocalLoraGallery(BaseLoraGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"model": ("MODEL",), "clip": ("CLIP",)}, 
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "selection_data": ("STRING", {"default": "[]", "multiline": True, "forceInput": True})
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "trigger_words")

    FUNCTION = "load_loras"
    CATEGORY = "📜Asset Gallery/Local"

    def load_loras(self, model, clip, unique_id, selection_data="[]", **kwargs):
        try:
            lora_configs = json.loads(selection_data)
        except:
            lora_configs = []

        all_metadata = load_metadata()
        trigger_words_list = []

        current_model, current_clip = model, clip
        applied_count = 0

        use_nunchaku_loader = self._is_nunchaku_model(model)

        loader_instance = NunchakuFluxLoraLoader() if use_nunchaku_loader else LoraLoader()
        print(f"LocalLoraGallery: Using {'NunchakuFluxLoraLoader' if use_nunchaku_loader else 'standard LoraLoader'}.")

        for config in lora_configs:
            if not config.get('on', True) or not config.get('lora'):
                continue

            lora_name = config['lora']

            lora_meta = all_metadata.get(lora_name, {})
            triggers = lora_meta.get('trigger_words', '').strip()
            if triggers:
                trigger_words_list.append(triggers)

            try:
                strength_model = float(config.get('strength', 1.0))
                strength_clip = float(config.get('strength_clip', strength_model))

                if strength_model == 0 and strength_clip == 0:
                    continue

                if use_nunchaku_loader:
                    (current_model,) = loader_instance.load_lora(current_model, lora_name, strength_model)
                else:
                    current_model, current_clip = loader_instance.load_lora(current_model, current_clip, lora_name, strength_model, strength_clip)

                applied_count += 1
            except Exception as e:
                print(f"LocalLoraGallery: Failed to load LoRA '{lora_name}': {e}")

        print(f"LocalLoraGallery: Applied {applied_count} LoRAs.")

        trigger_words_string = ", ".join(trigger_words_list)
        return (current_model, current_clip, trigger_words_string)

class LocalLoraGalleryModelOnly(BaseLoraGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"model": ("MODEL",)}, 
            "hidden": {
                "unique_id": "UNIQUE_ID",
                "selection_data": ("STRING", {"default": "[]", "multiline": True, "forceInput": True})
            }
        }

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "trigger_words")

    FUNCTION = "load_loras"
    CATEGORY = "📜Asset Gallery/Local"

    def load_loras(self, model, unique_id, selection_data="[]", **kwargs):
        try:
            lora_configs = json.loads(selection_data)
        except:
            lora_configs = []

        all_metadata = load_metadata()
        trigger_words_list = []

        current_model = model
        applied_count = 0

        use_nunchaku_loader = self._is_nunchaku_model(model)

        loader_instance = NunchakuFluxLoraLoader() if use_nunchaku_loader else LoraLoaderModelOnly()
        print(f"LocalLoraGalleryModelOnly: Using {'NunchakuFluxLoraLoader' if use_nunchaku_loader else 'standard LoraLoaderModelOnly'}.")

        for config in lora_configs:
            if not config.get('on', True) or not config.get('lora'):
                continue

            lora_name = config['lora']

            lora_meta = all_metadata.get(lora_name, {})
            triggers = lora_meta.get('trigger_words', '').strip()
            if triggers:
                trigger_words_list.append(triggers)

            try:
                strength_model = float(config.get('strength', 1.0))
                if strength_model == 0:
                    continue

                if use_nunchaku_loader:
                    (current_model,) = loader_instance.load_lora(current_model, lora_name, strength_model)
                else:
                    (current_model,) = loader_instance.load_lora_model_only(current_model, lora_name, strength_model)

                applied_count += 1
            except Exception as e:
                print(f"LocalLoraGalleryModelOnly: Failed to load LoRA '{lora_name}': {e}")

        print(f"LocalLoraGalleryModelOnly: Applied {applied_count} LoRAs.")

        trigger_words_string = ", ".join(trigger_words_list)
        return (current_model, trigger_words_string)

NODE_CLASS_MAPPINGS = {
    "LocalLoraGallery": LocalLoraGallery,
    "LocalLoraGalleryModelOnly": LocalLoraGalleryModelOnly
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "LocalLoraGallery": "Local Lora Gallery",
    "LocalLoraGalleryModelOnly": "Local Lora Gallery (Model Only)"
}