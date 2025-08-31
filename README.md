<div align="center">

# ComfyUI Local LoRA Gallery

### A custom node for ComfyUI that provides a visual gallery for managing and applying multiple LoRA models.

### 一个为 ComfyUI 打造的，用于管理和应用多个 LoRA 模型的可视化图库节点。

</div>

![11111111dddd](https://github.com/user-attachments/assets/df866b42-55c2-42e7-ab1b-ff40061e60b2)

---

## 🇬🇧 English

### Update Log (2025-08-31)
* **Multi-Select Dropdown**: The previous tag filter has been upgraded to a full-featured multi-select dropdown menu, allowing you to combine multiple tags by checking them.

### Update Log (2025-08-30)
* **Trigger Word Editor**: You can now add, edit, and save trigger words for each LoRA directly within the editor panel (when a single card is selected).
* **Download URL**: A new field allows you to save a source/download URL for each LoRA. A link icon (🔗) will appear on the card, allowing you to open the URL in a new browser tab.
* **Trigger Word Output**: A new trigger_words text output has been added to the node. It automatically concatenates the trigger words of all active LoRAs in the stack, ready to be connected to your prompt nodes.

---

### Overview

The Local LoRA Gallery node replaces the standard dropdown LoRA loader with an intuitive, card-based visual interface. It allows you to see your LoRA previews, organize them with tags, and stack multiple LoRAs with adjustable strengths. This node is designed to streamline your workflow, especially when working with a large collection of LoRAs.

It also features optional integration with **[comfyui-nunchaku](https://github.com/nunchaku-tech/comfyui-nunchaku)** for significant performance acceleration on compatible models like FLUX.

### ✨ Features

  * **Visual LoRA Selection**: Displays your LoRAs as cards with preview images.
  * **Multi-LoRA Stacking**: Click to add or remove multiple LoRAs to a stack, which are then applied in sequence.
  * **Advanced Tag Management**:
      * Add or remove tags for each LoRA directly within the UI.
      * **Batch edit tags**: Select multiple LoRAs (`Ctrl+Click` the pencil icon) and edit their common tags simultaneously.
  * **Powerful Filtering**:
      * Filter LoRAs by name.
      * Filter LoRAs by tags, with support for **OR** and **AND** logic.
  * **Intuitive Controls**:
      * Click the pencil icon (✏️) to enter editing mode. Click again to exit.
      * Press the `ESC` key to exit tag editing mode at any time.
  * **Nunchaku Acceleration**:
      * Automatically detects if the `comfyui-nunchaku` plugin is installed.
      * When a Nunchaku-compatible model (e.g., FLUX) is connected, it transparently uses the accelerated `NunchakuFluxLoraLoader` for faster performance.
      * Falls back to the standard loader for non-Nunchaku models, ensuring full compatibility.
  * **User-Friendly Interface**: Collapsible gallery view to save screen space.

### 💾 Installation

1.  Navigate to your ComfyUI `custom_nodes` directory.
    ```bash
    cd ComfyUI/custom_nodes/
    ```
2.  Clone this repository:
    ```bash
    git clone https://github.com/Firetheft/ComfyUI_Local_Lora_Gallery.git
    ```
3.  Restart ComfyUI.

### 📖 Usage

1.  In ComfyUI, add the **Local Lora Gallery** node (or **Local Lora Gallery (Model Only)**).
2.  Connect the `MODEL` and `CLIP` inputs to the node.
3.  The gallery will display your installed LoRAs.
4.  **To Apply LoRAs**: Simply click on a LoRA card. It will be added to the list at the top. Click it again in the gallery to remove it.
5.  **To Edit Tags**:
      * Click the pencil icon (✏️) on a card to select it for editing. The tag editor will appear.
      * **Multi-Select**: Hold `Ctrl` while clicking the pencil icon on multiple cards to select them all for batch editing.
      * Click a selected card's pencil icon again (without `Ctrl`) to deselect it if it's the only one selected.
      * Press `ESC` to deselect all cards and exit editing mode.
6.  **Filtering**:
      * Use the "Filter by Name..." input to search for LoRAs by filename.
      * Use the "Filter by Tag..." input and the `OR`/`AND` button to filter by your custom tags.
7.  Connect the `MODEL` and `CLIP` outputs from the gallery node to the next node in your workflow (e.g., KSampler).

### 🔗 Dependencies

  * **[comfyui-nunchaku](https://github.com/nunchaku-tech/comfyui-nunchaku)** (Optional): For GPU acceleration with compatible models. The plugin will function normally without it but will use the standard LoRA loader.

-----

## 🇨🇳 中文

### 更新日志 (2025-08-31)
* **多选下拉菜单**: 原有的标签筛选器已升级为功能完善的多选下拉菜单，允许您通过勾选来组合多个标签进行筛选。

### 更新日志 (2025-08-30)
* **触发词编辑器**: 现在您可以直接在编辑面板中为每个LoRA添加、编辑和保存触发词（当选中单个卡片时）。
* **下载地址**: 新增了一个输入框，用于为每个LoRA保存其来源或下载URL。卡片右上角会出现一个链接图标（🔗），点击即可在新标签页中打开该网址。
* **触发词输出**: 节点增加了一个新的 trigger_words 文本输出端口。它会自动拼接当前堆栈中所有已启用LoRA的触发词，可以直接连接到您的提示词节点。

---

### 概述

**Local LoRA Gallery (本地LoRA画廊)** 是一个ComfyUI自定义节点，它用一个直观的、基于卡片的视觉界面取代了标准的下拉式LoRA加载器。它允许您查看LoRA预览图、使用标签进行组织，并堆叠多个强度可调的LoRA。此节点旨在简化您的工作流程，尤其适合需要处理大量LoRA模型的使用者。

此外，本插件还集成了对 **[comfyui-nunchaku](https://github.com/nunchaku-tech/comfyui-nunchaku)** 的可选支持，可在兼容模型（如FLUX）上实现显著的性能加速。

### ✨ 功能特性

  * **可视化LoRA选择**: 以带有预览图的卡片形式展示您的LoRA模型。
  * **多LoRA堆叠**: 通过点击来添加或移除多个LoRA到一个堆栈中，它们将按顺序被应用。
  * **高级标签管理**:
      * 直接在界面中为每个LoRA添加或移除标签。
      * **批量编辑标签**: 按住 `Ctrl` 并点击铅笔图标 (✏️) 来选择多个LoRA，并同时编辑它们的共同标签。
  * **强大的筛选功能**:
      * 按名称筛选LoRA。
      * 按标签筛选LoRA，支持 **OR** (或) 和 **AND** (与) 两种逻辑。
  * **直观的交互控制**:
      * 点击铅笔图标 (✏️) 进入编辑模式，再次点击（或点击其他卡片）即可退出。
      * 随时按 `ESC` 键退出标签编辑模式。
  * **Nunchaku加速**:
      * 自动检测是否安装了 `comfyui-nunchaku` 插件。
      * 当连接了与Nunchaku兼容的模型（例如FLUX）时，它会自动使用加速的 `NunchakuFluxLoraLoader` 以获得更快的性能。
      * 对于非Nunchaku模型，它会回退到标准加载器，确保完全兼容。
  * **友好的界面**: 画廊视图可折叠，以节省屏幕空间。

### 💾 安装说明

1.  进入您的 ComfyUI 安装目录下的 `custom_nodes` 文件夹。
    ```bash
    cd ComfyUI/custom_nodes/
    ```
2.  克隆此仓库：
    ```bash
    git clone https://github.com/Firetheft/ComfyUI_Local_Lora_Gallery.git
    ```
3.  重启 ComfyUI。

### 📖 使用方法

1.  在 ComfyUI 中，添加 **Local Lora Gallery** 节点 (或 **Local Lora Gallery (Model Only)**)。
2.  将 `MODEL` 和 `CLIP` 连接到该节点的输入端。
3.  画廊将显示您已安装的LoRA。
4.  **应用LoRA**: 只需单击LoRA卡片，它就会被添加到顶部的列表中。再次点击卡片可将其移除。
5.  **编辑标签**:
      * 点击卡片上的铅笔图标 (✏️) 以选择它进行编辑，标签编辑器将会出现。
      * **多选**: 按住 `Ctrl` 键并点击多张卡片上的铅笔图标，以将它们全部选中进行批量编辑。
      * 再次单击已选中卡片的铅笔图标（不按 `Ctrl`），如果它是唯一被选中的卡片，则会取消选择。
      * 按 `ESC` 键可取消所有卡片的选中状态并退出编辑模式。
6.  **筛选**:
      * 使用 "Filter by Name..." 输入框按文件名搜索LoRA。
      * 使用 "Filter by Tag..." 输入框和 `OR`/`AND` 按钮按您的自定义标签进行筛选。
7.  将画廊节点的 `MODEL` 和 `CLIP` 输出连接到工作流的下一个节点（例如 KSampler）。

### 🔗 依赖项

  * **[comfyui-nunchaku](https://github.com/nunchaku-tech/comfyui-nunchaku)** (可选): 用于在兼容模型上实现GPU加速。如果没有安装，此插件也能正常工作，但会使用标准的LoRA加载器。
