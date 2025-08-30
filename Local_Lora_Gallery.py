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
SELECTIONS_FILE = os.path.join(NODE_DIR, "lora_gallery_selections.json")
METADATA_FILE = os.path.join(NODE_DIR, "lora_gallery_metadata.json")
UI_STATE_FILE = os.path.join(NODE_DIR, "lora_gallery_ui_state.json")

VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.avi']
IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

def load_json_file(file_path):
    if not os.path.exists(file_path):
        return {}
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return {}

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
load_selections = lambda: load_json_file(SELECTIONS_FILE)
save_selections = lambda data: save_json_file(data, SELECTIONS_FILE)

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

@server.PromptServer.instance.routes.get("/localloragallery/get_loras")
async def get_loras_endpoint(request):
    try:
        filter_tags_str = request.query.get('filter_tag', '').strip().lower()
        filter_tags = [tag.strip() for tag in filter_tags_str.split(',') if tag.strip()]
        filter_mode = request.query.get('mode', 'OR').upper()

        lora_files = folder_paths.get_filename_list("loras")
        metadata = load_metadata()
        lora_info_list = []

        for lora in lora_files:
            lora_meta = metadata.get(lora, {})
            tags = [t.lower() for t in lora_meta.get('tags', [])]

            if filter_tags:
                if filter_mode == 'AND':
                    if not all(ft in tags for ft in filter_tags):
                        continue
                else:
                    if not any(ft in tags for ft in filter_tags):
                        continue

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
                "download_url": lora_meta.get('download_url', '')
            })

        return web.json_response(lora_info_list)
    except Exception as e:
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
        state = data.get("state", {})
        ui_states = load_ui_state()
        if node_id not in ui_states:
            ui_states[node_id] = {}
        ui_states[node_id].update(state)
        save_ui_state(ui_states)
        return web.json_response({"status": "ok"})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.get("/localloragallery/get_ui_state")
async def get_ui_state(request):
    try:
        node_id = request.query.get('node_id')
        if not node_id:
            return web.json_response({"error": "node_id is required"}, status=400)
        ui_states = load_ui_state()
        node_state = ui_states.get(str(node_id), {"is_collapsed": False})
        return web.json_response(node_state)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@server.PromptServer.instance.routes.post("/localloragallery/set_selection")
async def set_lora_selection(request):
    try:
        data = await request.json()
        selections = load_selections()
        selections[str(data.get("node_id"))] = data.get("lora_stack", [])
        save_selections(selections)
        return web.json_response({"status": "ok"})
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

@server.PromptServer.instance.routes.get("/localloragallery/get_selection")
async def get_lora_selection(request):
    try:
        node_id = request.query.get('node_id')
        if not node_id:
            return web.json_response({"error": "node_id is required"}, status=400)
        return web.json_response({"lora_stack": load_selections().get(str(node_id), [])})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)

class BaseLoraGallery:
    """Base class for common functionality."""
    
    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if os.path.exists(SELECTIONS_FILE):
            return os.path.getmtime(SELECTIONS_FILE)
        return float("inf")

    def _is_nunchaku_model(self, model):
        """Checks if the model is a Nunchaku-accelerated model."""
        if not is_nunchaku_available:
            return False
        return hasattr(model.model, 'diffusion_model') and model.model.diffusion_model.__class__.__name__ == 'ComfyFluxWrapper'

class LocalLoraGallery(BaseLoraGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"model": ("MODEL",), "clip": ("CLIP",)}, "hidden": {"unique_id": "UNIQUE_ID"}}
    
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("MODEL", "CLIP", "trigger_words")
    
    FUNCTION = "load_loras"
    CATEGORY = "📜Asset Gallery/Local"

    def load_loras(self, model, clip, unique_id, **kwargs):
        lora_configs = load_selections().get(str(unique_id), [])
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
        return {"required": {"model": ("MODEL",)}, "hidden": {"unique_id": "UNIQUE_ID"}}

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("MODEL", "trigger_words")

    FUNCTION = "load_loras"
    CATEGORY = "📜Asset Gallery/Local"

    def load_loras(self, model, unique_id, **kwargs):
        lora_configs = load_selections().get(str(unique_id), [])
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