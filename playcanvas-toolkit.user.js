// ==UserScript==
// @name         PlayCanvas Toolkit
// @namespace    local.playcanvas.toolkit
// @version      1.3.1
// @description  拡張可能なツールパネル：Materialコピー・同期・参照置換、Maya選択、Renderタグ・Layersコピー
// @match        https://playcanvas.com/editor*
// @match        https://playcanvas.com/project/*
// @match        https://*.playcanvas.com/editor*
// @match        https://editor.playcanvas.com/*
// @run-at       document-idle
// @grant        none
// @sandbox      MAIN_WORLD
// @inject-into  page
// @noframes
// @updateURL    https://raw.githubusercontent.com/spacetimeroom-boop/playcanvas-toolkit/main/playcanvas-toolkit.user.js
// @downloadURL  https://raw.githubusercontent.com/spacetimeroom-boop/playcanvas-toolkit/main/playcanvas-toolkit.user.js
// ==/UserScript==

(() => {
"use strict";
// Modules register here. Each instance owns its DOM, data and lifecycle hooks.
if (window.__pcToolkit_v1__) return;
const Toolkit = (() => {
    const modules = new Map();
    const instances = new Map();
    const storageKey = 'pc-toolkit:ui:v1';
    let active, host, root, pages, menu, description, notice, toggle, collapsed = false;
    let blocked = false;
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
    function save() {
        try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch {}
    }
    function register(module) {
        if (!/^[a-z][a-z0-9-]*$/.test(module.id) || modules.has(module.id) || typeof module.mount !== 'function')
            throw new Error('Invalid or duplicate tool: ' + module.id);
        if (module.shortcut !== undefined && (!/^[a-z]$/.test(module.shortcut) ||
            [...modules.values()].some(item => item.shortcut === module.shortcut)))
            throw new Error('Invalid or duplicate shortcut: ' + module.id);
        modules.set(module.id, module);
    }
    function position(x, y) {
        const rect = host.getBoundingClientRect();
        prefs.x = Math.max(8, Math.min(x, innerWidth - rect.width - 8));
        prefs.y = Math.max(8, Math.min(y, innerHeight - 44));
        Object.assign(host.style, { left: `${prefs.x}px`, top: `${prefs.y}px`, right: 'auto' });
    }
    function busy() { return instances.get(active)?.hooks.isBusy?.() === true; }
    function deactivate() { instances.get(active)?.hooks.onHide?.(); }
    function setCollapsed(value) {
        if (busy()) { notice.textContent = '処理が完了してから切り替えてください。'; return; }
        if (collapsed === value) return;
        collapsed = value;
        if (collapsed) deactivate(); else if (!blocked) instances.get(active)?.hooks.onShow?.();
        root.querySelector('.content').hidden = collapsed;
        toggle.textContent = collapsed ? '+' : '−';
        toggle.setAttribute('aria-label', collapsed ? '展開' : '最小化');
        toggle.setAttribute('aria-expanded', String(!collapsed));
    }
    function select(id) {
        if (blocked || !modules.has(id)) return;
        if (busy()) { menu.value = active; notice.textContent = '処理が完了してから切り替えてください。'; return; }
        deactivate();
        let item = instances.get(id);
        if (!item) {
            const container = document.createElement('div');
            container.className = 'tool-page';
            pages.append(container);
            const hooks = {};
            item = { container, hooks };
            instances.set(id, item);
            let bound;
            const isCurrentContext = () => {
                const editor = window.editor, api = editor?.api?.globals;
                if (blocked || !api) return false;
                const scope = `${api.projectId}:${api.branchId}:${location.pathname}${location.search}`;
                if (!bound) bound = { editor, scope };
                return bound.editor === editor && bound.scope === scope;
            };
            isCurrentContext();
            try { modules.get(id).mount({ container, root, hooks, isCurrentContext }); }
            catch (error) { container.textContent = '起動エラー: ' + error.message; console.error(error); }
        }
        active = id;
        for (const [key, instance] of instances) instance.container.hidden = key !== id;
        if (!collapsed) item.hooks.onShow?.();
        menu.value = id;
        description.textContent = modules.get(id).description;
        notice.textContent = '';
        prefs.active = id;
        save();
    }
    function boot() {
        host = document.createElement('div');
        host.id = 'pc-toolkit';
        host.style.cssText = 'position:fixed;right:16px;top:72px;width:410px;max-width:calc(100vw - 16px);z-index:2147483647;';
        root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
          :host{color-scheme:dark}*{box-sizing:border-box}[hidden]{display:none!important}
          .shell{color:#e6eaf0;background:#20252c;border:1px solid #526072;border-radius:9px;box-shadow:0 12px 35px #0008;font:12px/1.5 system-ui,sans-serif;overflow:hidden}
          .bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#151b22;cursor:move;touch-action:none}
          button,select{font:inherit;color:inherit;background:#303d4c;border:1px solid #63758a;border-radius:4px;padding:5px 8px}
          button{cursor:pointer}.picker{padding:10px 12px}.picker select{width:100%}.description{margin:8px 0 0;color:#b6c7d8}.notice{color:#ffc778;margin:0 12px}
          .pages{max-height:calc(100vh - 235px);overflow:auto;padding:0 8px 8px}
          #pc-material-sync{position:static!important;width:100%!important;max-width:none!important;max-height:none!important;box-shadow:none!important;border:0!important}
          #pc-material-sync .pms-header{display:none!important}
          #pc-material-sync .pms-body{max-height:none!important}
        </style><section class="shell" aria-label="PlayCanvas Toolkit">
        <header class="bar"><strong>PlayCanvas Toolkit</strong><button type="button" aria-label="最小化" aria-expanded="true">−</button></header>
        <div class="content"><div class="picker"><select aria-label="ツールを選択"></select><p class="description"></p></div><p class="notice" role="status"></p><div class="pages"></div></div></section>`;
        menu = root.querySelector('select'); pages = root.querySelector('.pages');
        description = root.querySelector('.description'); notice = root.querySelector('.notice');
        for (const module of modules.values()) {
            const option = document.createElement('option'); option.value = module.id; option.textContent = module.title; menu.append(option);
        }
        document.body.append(host);
        for (const type of ['pointerdown','mousedown','click','dblclick','keydown','keyup','wheel'])
            root.addEventListener(type, e => e.stopPropagation());
        menu.addEventListener('change', () => select(menu.value));
        const bar = root.querySelector('.bar'); toggle = bar.querySelector('button');
        toggle.addEventListener('click', () => setCollapsed(!collapsed));
        window.addEventListener('keydown', event => {
            if (event.repeat || event.isComposing || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return;
            const module = [...modules.values()].find(item => item.shortcut === event.key.toLowerCase());
            if (!module || blocked) return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (busy()) { notice.textContent = '処理が完了してから切り替えてください。'; return; }
            if (active === module.id) setCollapsed(!collapsed);
            else { select(module.id); setCollapsed(false); }
        }, true);
        let drag;
        bar.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('button')) return;
            const rect = host.getBoundingClientRect(); drag = { id:e.pointerId, x:e.clientX-rect.left, y:e.clientY-rect.top };
            bar.setPointerCapture(e.pointerId); e.preventDefault();
        });
        bar.addEventListener('pointermove', e => { if (drag?.id === e.pointerId) position(e.clientX-drag.x,e.clientY-drag.y); });
        for (const event of ['pointerup','pointercancel','lostpointercapture']) bar.addEventListener(event, () => { drag=null; save(); });
        window.addEventListener('resize', () => { const rect=host.getBoundingClientRect(); position(rect.left,rect.top); });
        if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) position(prefs.x,prefs.y);
        select(modules.has(prefs.active) ? prefs.active : modules.keys().next().value);
        // Existing modules bind live Editor assets. Stop access if this page changes scope.
        const initialApi = window.editor?.api?.globals;
        let initial = initialApi?.projectId && initialApi?.branchId ? {
            editor: window.editor,
            scope: `${initialApi.projectId}:${initialApi.branchId}:${location.pathname}${location.search}`
        } : null;
        setInterval(() => {
            const editor = window.editor, api = editor?.api?.globals;
            if (!api?.projectId || !api?.branchId || blocked) return;
            const scope = `${api.projectId}:${api.branchId}:${location.pathname}${location.search}`;
            if (!initial) { initial = { editor, scope }; return; }
            if (initial.editor !== editor || initial.scope !== scope) {
                blocked = true; deactivate(); pages.hidden = true; menu.disabled = true;
                notice.textContent = 'プロジェクトまたはブランチが変わりました。ページを再読み込みしてください。';
            }
        }, 750);
    }
    return { register, boot };
})();
window.__pcToolkit_v1__ = { version: '1.3.1' };

// Adapted from the supplied userscript; material operations stay local to this module.
Toolkit.register({
 id: "material-copy",
 title: "Material コピー",
 description: "別タブ・別プロジェクトへコピー。参照Assetは名前・種類で照合します。",
 mount(ctx) {
/*
 * 使い方: AssetsでMaterialを1つ選択 → コピー元に設定 → コピー先を複数選択 → ペースト。
 * コピー元はボタンを押した時点のスナップショット。再コピーで更新。
 * 同じChromeプロファイル・同じoriginのEditorタブ間でコピー元を共有する。
 * コピー元はlocalStorageに保存され、リロード/プロジェクト切替後も保持される。
 * 別プロジェクト/ブランチでは参照Assetの名前（完全一致）・種類を照合し、
 * 一意に一致するコピー先AssetのIDに変換する。IDをそのまま流用しない。
 * 対応Assetがない場合はその参照だけコピー先の設定を維持し、他の設定をコピー。
 * 同名候補が複数で曖昧な場合は変更前に中止。Textureのアップロードや複製はしない。
 * フォルダーは照合しない。同名Textureの画像内容が同一かどうかは検証しない。
 * コピー元の情報は「共有コピー元をクリア」で削除できる（他タブにも反映）。
 *
 * 調査: 2026-09-20取得の公式 playcanvas/editor main:
 * src/editor-api/{asset,selection,history,globals}.ts
 * src/editor/assets/{assets,assets-registry,assets-history,assets-create-material}.ts
 * src/editor/inspector/assets/material.ts, src/editor/schema/schema-material.ts
 * https://github.com/playcanvas/editor
 * https://api.playcanvas.com/editor/classes/Asset.html
 * https://api.playcanvas.com/editor/classes/History.html
 * 1.1.0の参照検出: editor.schema.assets.getFieldsOfType('material', 'asset')
 * https://api.playcanvas.com/editor/classes/AssetsSchema.html
 *
 * Asset.set('data', ...) はObserverの変更通知、Realtime同期、Inspector binding、
 * assets-registryの遅延更新を経由する。Engineのresourceを直接変更しない。
 * Textureはdata内のID参照をそのままコピーする。Asset外側のメタデータは書かない。
 * サーバーによる更新日時等の通常の自動更新はEditorの仕様に従う。
 * 公開APIが存在しない旧環境のみ、既存editor.callでObserverを取得する。
 * History機能が検出できない場合は通常のObserver履歴に任せ、一括Undoは省略する。
 * 実プロジェクトでのE2E検証は未実施。公開ソースとローカルのモックで検証。
 */

    'use strict';
    const state = { source: null, adapter: null, context: '', busy: false };
    const PREFIX = '[Material Copy Tool]';
    const log = (...args) => console.info(PREFIX, ...args);
    const fail = (...args) => console.error(PREFIX, ...args);
    const STORAGE = 'pc-material-copy-tool:ui:v1';
    const CLIPBOARD = 'pc-material-copy-tool:clipboard:v1';
    const MAX_CLIPBOARD = 4 * 1024 * 1024;
    const clone = value => JSON.parse(JSON.stringify(value));
    const equal = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(k =>
            Object.prototype.hasOwnProperty.call(b, k) && equal(a[k], b[k]));
    };
    function validate(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.keys(data).length)
            throw new Error('Materialのdataが未読込、空、または未対応形式です。');
        const visit = value => {
            if (!value || typeof value !== 'object') return;
            for (const key of Object.keys(value)) {
                if (['__proto__', 'prototype', 'constructor'].includes(key) || key.includes('.'))
                    throw new Error(`安全に扱えないdataキー: ${key}`);
                visit(value[key]);
            }
        };
        visit(data);
        return data;
    }

    // -------- Editor API adapter: Editorへのアクセスはこのクラスに集約 --------
    class Adapter {
        constructor(editor) {
            this.editor = editor;
            this.api = editor.api?.globals || editor;
        }
        call(name, ...args) { return this.editor.call?.(name, ...args); }
        context() {
            return `${this.api.projectId ?? ''}:${this.api.branchId ?? ''}:${location.pathname}${location.search}`;
        }
        scope() {
            const project = this.api.projectId, branch = this.api.branchId;
            if (project == null || branch == null || String(project) === '' || String(branch) === '')
                throw new Error('プロジェクト/ブランチIDを確認できません。');
            return { project: String(project), branch: String(branch) };
        }
        listAssets() {
            const result = this.api.assets?.list ? this.api.assets.list() : this.call('assets:list');
            if (!Array.isArray(result)) throw new Error('Asset一覧を取得できません。');
            return result;
        }
        referencePaths() {
            const schema = this.api.schema?.assets;
            if (typeof schema?.getFieldsOfType !== 'function') return null;
            const paths = schema.getFieldsOfType('material', 'asset');
            if (!Array.isArray(paths) || !paths.every(p => typeof p === 'string' && p.startsWith('data.')))
                throw new Error('Materialの参照スキーマが未対応形式です。');
            return paths;
        }
        assetDescriptor(asset) {
            if (!asset || asset.get('source')) throw new Error('参照先Assetが未読込または無効です。');
            // folders is retained only for compatibility with v1.1 shared clipboard records.
            // Matching does not require loading or resolving any folder assets.
            return { folders: [], name: this.getAssetName(asset), type: String(asset.get('type')) };
        }
        ready() {
            if (this.editor.isCodeEditor) return false;
            const selection = this.api.selection;
            const official = this.api.assets?.get && selection && Array.isArray(selection.items);
            const legacy = this.call('assets:raw') && Array.isArray(this.call('selector:items'));
            const panel = this.call('layout.assets');
            // Current Editor assigns panel.assets only after assets:load (also works for empty projects).
            if (panel && 'assets' in panel && !panel.assets) return false;
            // viewport:app and permissions methods are installed during Editor load.
            return Boolean((official || legacy) && this.call('viewport:app') &&
                typeof this.call('permissions:write') === 'boolean');
        }
        assertWritable() {
            if (this.call('permissions:write') !== true)
                throw new Error('書き込み権限を確認できません。変更は実行しません。');
        }
        getAssetId(asset) { return String(asset.get('id')); }
        getAssetName(asset) { return String(asset.get('name') ?? '(無名)'); }
        getAsset(id) {
            if (this.api.assets?.get) return this.api.assets.get(Number(id));
            return this.call('assets:get', Number(id));
        }
        getSelectedAssets() {
            if (this.api.selection && Array.isArray(this.api.selection.items)) {
                // Keep all selected items for the strict single-selection source check.
                return this.api.selection.items.slice();
            }
            if (this.call('selector:type') !== 'asset') return [];
            const items = this.call('selector:items');
            if (!Array.isArray(items)) throw new Error('Assetsの選択APIに対応していません。');
            return items.slice();
        }
        isMaterial(asset) {
            if (!asset || typeof asset.get !== 'function' || asset.get('type') !== 'material' || asset.get('source')) return false;
            const live = this.getAsset(asset.get('id'));
            return Boolean(live && (live === asset || live.observer === asset || asset.observer === live));
        }
        getSelectedMaterials(items = this.getSelectedAssets()) {
            return [...new Map(items.filter(a => this.isMaterial(a)).map(a => [this.getAssetId(a), a])).values()];
        }
        getMaterialData(asset) {
            if (!this.isMaterial(asset)) throw new Error('対象は現在のMaterial Assetではありません。');
            // json() returns a detached serialization; no metadata leaves this method.
            const data = typeof asset.json === 'function' ? asset.json().data : asset.get('data');
            return validate(clone(data));
        }
        historyState(asset) {
            const history = asset.observer?.history || asset.history;
            return history && typeof history.enabled === 'boolean' ? history : null;
        }
        historyAvailable(assets) {
            return typeof this.api.history?.add === 'function' && assets.every(a => this.historyState(a));
        }
        addHistory(action) {
            if (this.api.history.add(action) === false) throw new Error('History APIが履歴の登録を拒否しました。');
        }
        applyMaterialData(asset, data, suppressHistory) {
            this.assertWritable();
            if (!this.isMaterial(asset)) throw new Error('Materialが削除されたか別のAssetに変わりました。');
            if (typeof asset.set !== 'function') throw new Error('Observer.setがありません。');
            const desired = validate(clone(data));
            const history = this.historyState(asset);
            if (suppressHistory && !history) throw new Error('Undo制御を確認できません。');
            const enabled = history?.enabled;
            try {
                if (suppressHistory) history.enabled = false;
                // Whole-object replacement removes target-only fields too; no fixed property list.
                asset.set('data', desired);
                if (!equal(this.getMaterialData(asset), desired))
                    throw new Error('dataの書き込み検証に失敗しました。');
            } finally {
                if (suppressHistory) history.enabled = enabled;
            }
        }
        refreshMaterial() {
            // Observer notifications already refresh Inspector and schedule the engine asset update.
            // Request rendering only; do not fabricate events or mutate engine resources.
            try { this.call('viewport:render'); } catch (error) { fail('Viewport refresh:', error); }
        }
    }

    let ui;
    let prefs = { confirm: true, minimized: false };
    try { Object.assign(prefs, JSON.parse(localStorage.getItem(STORAGE) || '{}')); }
    catch (error) { fail('UI設定の読み込み:', error); }
    function save() {
        try { localStorage.setItem(STORAGE, JSON.stringify(prefs)); }
        catch (error) { fail('UI設定の保存:', error); }
    }
    function status(text) { if (ui) ui.status.textContent = text; }
    const sameScope = (a, b) => a.project === b.project && a.branch === b.branch;
    const descriptorKey = d => JSON.stringify([d.type, d.name]);
    const safeSegment = key => typeof key === 'string' && key.length > 0 &&
        !['__proto__', 'prototype', 'constructor'].includes(key) && !key.includes('.');
    // Expand the official schema's wildcard paths and array:asset fields into concrete slots.
    function referenceSlots(data, paths) {
        const slots = new Map();
        function walk(value, pattern, concrete) {
            if (!pattern.length) {
                if (Array.isArray(value)) { value.forEach((v, i) => walk(v, [], [...concrete, String(i)])); return; }
                if (value == null || value === 0 || value === '') return;
                if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value)))
                    throw new Error(`未対応のAsset参照: data.${concrete.join('.')}`);
                slots.set(JSON.stringify(concrete), { path: concrete, id: String(value) });
                return;
            }
            if (!value || typeof value !== 'object') return;
            const [part, ...rest] = pattern;
            if (part === '*') {
                for (const key of Object.keys(value)) walk(value[key], rest, [...concrete, key]);
            } else if (Object.prototype.hasOwnProperty.call(value, part)) walk(value[part], rest, [...concrete, part]);
        }
        for (const path of paths) {
            if (typeof path !== 'string' || !path.startsWith('data.')) throw new Error('参照パスが不正です。');
            const parts = path.slice(5).split('.');
            if (!parts.every(p => p === '*' || safeSegment(p))) throw new Error('参照パスが不正です。');
            walk(data, parts, []);
        }
        return [...slots.values()];
    }
    function captureReferences(adapter, data) {
        const paths = adapter.referencePaths();
        if (paths === null) return { verified: false, paths: [], refs: [] };
        const refs = referenceSlots(data, paths).map(slot => {
            try { return { ...slot, asset: adapter.assetDescriptor(adapter.getAsset(slot.id)) }; }
            catch (error) { return { ...slot, asset: null, error: error.message }; }
        });
        return { verified: true, paths, refs };
    }
    function readClipboard() {
        const raw = localStorage.getItem(CLIPBOARD);
        if (!raw) return null;
        if (raw.length > MAX_CLIPBOARD) throw new Error('共有コピー元のデータが大きすぎます。');
        const value = JSON.parse(raw);
        if (value?.version !== 1 || typeof value.name !== 'string' || !/^[1-9]\d*$/.test(value.id) ||
            typeof value.scope?.project !== 'string' || !value.scope.project ||
            typeof value.scope?.branch !== 'string' || !value.scope.branch ||
            typeof value.references?.verified !== 'boolean' ||
            !Array.isArray(value.references?.paths) || !Array.isArray(value.references?.refs))
            throw new Error('共有コピー元の形式が不正です。再コピーしてください。');
        validate(value.data);
        return value;
    }
    function syncClipboard(announce = false) {
        try {
            const source = readClipboard();
            const changed = JSON.stringify(source) !== JSON.stringify(state.source);
            state.source = source;
            if (changed) {
                lastSelection = '';
                renderSelection();
                if (announce) status(source ? '別タブのコピー元を受信しました。' : '共有コピー元をクリアしました。');
            }
            return source;
        } catch (error) {
            state.source = null; lastSelection = '';
            renderSelection();
            throw error;
        }
    }
    function clearSource() {
        try { localStorage.removeItem(CLIPBOARD); syncClipboard(); status('共有コピー元をクリアしました。'); }
        catch (error) { status(error.message); fail('Clipboard clear:', error); }
    }
    function prepareData(adapter, source) {
        const data = clone(source.data);
        if (sameScope(source.scope, adapter.scope())) return { data, remapped: 0, cross: false };
        const destinationPaths = adapter.referencePaths();
        if (!source.references.verified || destinationPaths === null)
            throw new Error('参照スキーマAPIを確認できないため、別プロジェクト/ブランチへのペーストは中止しました。');
        const slots = referenceSlots(data, [...new Set([...source.references.paths, ...destinationPaths])]);
        const descriptors = new Map();
        for (const ref of source.references.refs) {
            if (!Array.isArray(ref.path) || !ref.path.every(safeSegment)) throw new Error('共有参照データが不正です。');
            const key = JSON.stringify(ref.path);
            if (descriptors.has(key)) throw new Error('共有参照データに重複があります。');
            descriptors.set(key, ref);
        }
        const index = new Map();
        const requiredTypes = new Set(source.references.refs.map(ref => ref.asset?.type).filter(Boolean));
        if (slots.length) for (const asset of adapter.listAssets()) {
            if (asset.get('source') || asset.get('type') === 'folder' || !requiredTypes.has(asset.get('type'))) continue;
            try {
                const key = descriptorKey(adapter.assetDescriptor(asset));
                if (!index.has(key)) index.set(key, []);
                index.get(key).push(asset);
            } catch (error) { fail('Reference candidate ignored:', adapter.getAssetId(asset), error); }
        }
        const errors = [], missing = [];
        for (const slot of slots) {
            const ref = descriptors.get(JSON.stringify(slot.path));
            const label = `data.${slot.path.join('.')}`;
            if (!ref || ref.id !== slot.id || !ref.asset || !Array.isArray(ref.asset.folders) ||
                !ref.asset.folders.every(s => typeof s === 'string') || typeof ref.asset.name !== 'string' || typeof ref.asset.type !== 'string') {
                errors.push(`${label}: コピー元の参照情報がありません。再コピーしてください。`); continue;
            }
            const candidates = index.get(descriptorKey(ref.asset)) || [];
            if (!candidates.length) {
                missing.push({ path: slot.path, message: `${label}: ${ref.asset.name} (${ref.asset.type}) — コピー先に存在しません。既存設定を維持` });
                continue;
            }
            if (candidates.length > 1) {
                errors.push(`${label}: ${ref.asset.name} (${ref.asset.type}) — 同名・同種類の候補が複数`);
                continue;
            }
            let parent = data;
            for (const key of slot.path.slice(0, -1)) parent = parent[key];
            const key = slot.path.at(-1), id = adapter.getAssetId(candidates[0]);
            parent[key] = typeof parent[key] === 'string' ? id : Number(id);
        }
        if (errors.length) throw new Error(`参照を解決できないため変更していません。\n${errors.join('\n')}`);
        return { data, remapped: slots.length - missing.length, cross: true, missing };
    }
    function dataForTarget(prepared, before) {
        const data = clone(prepared.data);
        for (const { path } of prepared.missing || []) {
            let previous = before, parent = data;
            for (const key of path.slice(0, -1)) {
                previous = previous && typeof previous === 'object' && Object.prototype.hasOwnProperty.call(previous, key) ? previous[key] : undefined;
                parent = parent[key];
            }
            const key = path.at(-1);
            if (previous && typeof previous === 'object' && Object.prototype.hasOwnProperty.call(previous, key)) {
                parent[key] = clone(previous[key]);
            } else if (Array.isArray(parent)) {
                // Do not splice: that would shift the other reference slots. Null means no asset.
                parent[key] = null;
            } else {
                // Preserve an unset target field; never leave the foreign project's ID here.
                delete parent[key];
            }
        }
        return data;
    }
    function current() {
        if (!ctx.isCurrentContext()) throw new Error('プロジェクトが変わりました。ページを再読み込みしてください。');
        const adapter = state.adapter;
        if (!adapter || window.editor !== adapter.editor || !adapter.ready() || adapter.context() !== state.context)
            throw new Error('Editorの初期化または画面切替中です。少し待って再実行してください。');
        return adapter;
    }
    function setSource() {
        try {
            const adapter = current();
            const items = adapter.getSelectedAssets();
            if (items.length !== 1) throw new Error('コピー元はMaterial Assetを1つだけ選択してください。');
            const asset = items[0];
            if (!adapter.isMaterial(asset)) throw new Error('選択中のAssetはMaterialではありません。');
            const data = adapter.getMaterialData(asset);
            const source = {
                version: 1, scope: adapter.scope(), copiedAt: Date.now(),
                id: adapter.getAssetId(asset), name: adapter.getAssetName(asset),
                data, references: captureReferences(adapter, data)
            };
            const serialized = JSON.stringify(source);
            if (serialized.length > MAX_CLIPBOARD) throw new Error('共有コピー元のデータが大きすぎます。');
            localStorage.setItem(CLIPBOARD, serialized);
            state.source = source;
            log(`Source: ${state.source.name} (${state.source.id})`);
            status(source.references.verified
                ? 'コピー元を共有保存しました。別プロジェクトでは参照Assetを照合します。'
                : 'コピー元を共有保存しました。参照スキーマ未対応のため同じプロジェクト/ブランチ内のみ利用できます。');
            renderSelection();
        } catch (error) { status(error.message); fail('Source:', error); }
    }
    function describeError(adapter, asset, error) {
        fail(`Failed: ${adapter.getAssetName(asset)}\nID: ${adapter.getAssetId(asset)}\nReason: ${error.message}`, error);
    }
    function paste() {
        if (state.busy) return;
        state.busy = true;
        try {
            const adapter = current();
            adapter.assertWritable();
            // Read at click time: suspended/background tabs may miss or delay storage events.
            const source = syncClipboard();
            if (!source) throw new Error('先にいずれかのタブでコピー元を設定してください。');
            const items = adapter.getSelectedAssets();
            const materials = adapter.getSelectedMaterials(items);
            const ownScope = sameScope(source.scope, adapter.scope());
            const targets = materials.filter(a => !(ownScope && adapter.getAssetId(a) === source.id));
            let skipped = materials.length - targets.length;
            let failed = 0;
            let succeeded = 0;
            let rollbackFailed = 0;
            if (!materials.length) throw new Error('コピー先Materialが選択されていません。');
            const prepared = targets.length ? prepareData(adapter, source) : { data: source.data, cross: false, remapped: 0 };
            const missingNotice = prepared.missing?.length ? `\n参照未検出：${prepared.missing.length}項目（各Materialの既存設定を維持）\n${prepared.missing.map(item => item.message).join('\n')}` : '';
            if (missingNotice) log(missingNotice);
            if (prefs.confirm && targets.length && !window.confirm(`${targets.length}個のMaterialを上書きします。${prepared.cross ? `\n別プロジェクト/ブランチからコピーし、${prepared.remapped}件の参照を名前・種類で対応付けます（フォルダー不問）。` : ''}${missingNotice}\n実行しますか？`)) {
                status('キャンセルしました。'); return;
            }
            current(); // revalidate after modal confirmation
            log(`Selected targets: ${targets.length}`);
            const grouped = adapter.historyAvailable(targets);
            const records = [];
            // Synchronous batch prevents interleaving unrelated user edits in one history action.
            // Editor batches engine asset updates with setTimeout internally.
            for (const asset of targets) {
                let before;
                try {
                    before = adapter.getMaterialData(asset);
                    const desired = dataForTarget(prepared, before);
                    if (equal(before, desired)) { skipped++; continue; }
                    log(`Updating ${adapter.getAssetName(asset)}`);
                    adapter.applyMaterialData(asset, desired, grouped);
                    records.push({ id: adapter.getAssetId(asset), before, after: clone(desired) });
                    succeeded++;
                } catch (error) {
                    failed++;
                    describeError(adapter, asset, error);
                    if (before) {
                        try { adapter.applyMaterialData(asset, before, grouped); }
                        catch (rollbackError) {
                            rollbackFailed++;
                            fail('Rollback failed:', adapter.getAssetId(asset), rollbackError);
                            status('復元にも失敗しました。Consoleを確認してください。');
                            // Preserve the partial state in the Undo action if possible.
                            if (grouped) {
                                try { records.push({ id: adapter.getAssetId(asset), before, after: adapter.getMaterialData(asset) }); }
                                catch (readError) { fail('Partial state read:', readError); }
                            }
                        }
                    }
                }
            }
            if (grouped && records.length) {
                const context = state.context;
                const restore = direction => {
                    let done = 0, errors = 0;
                    try {
                        if (current() !== adapter || state.context !== context) throw new Error('異なる画面でのUndo/Redoは実行しません。');
                        adapter.assertWritable();
                        for (const record of records) {
                            try {
                                const asset = adapter.getAsset(record.id);
                                adapter.applyMaterialData(asset, record[direction], true);
                                done++;
                            } catch (error) { errors++; fail(`Undo/Redo ID: ${record.id}`, error); }
                        }
                        adapter.refreshMaterial();
                        status(`${direction === 'before' ? 'Undo' : 'Redo'}：成功 ${done} / 失敗 ${errors}`);
                    } catch (error) { status(error.message); fail('Undo/Redo:', error); }
                };
                try {
                    adapter.addHistory({ name: `Material Copy (${records.length})`, undo: () => restore('before'), redo: () => restore('after') });
                } catch (error) {
                    // Do not leave untracked writes if the promised grouped history registration fails.
                    let rollbackFailures = 0;
                    for (const record of records) {
                        try { adapter.applyMaterialData(adapter.getAsset(record.id), record.before, true); }
                        catch (rollbackError) { rollbackFailures++; fail('History rollback:', record.id, rollbackError); }
                    }
                    throw new Error(`Undo登録に失敗したため変更を復元しました（復元失敗 ${rollbackFailures}件）。${error.message}`);
                }
            }
            adapter.refreshMaterial();
            log(`Completed: ${succeeded}; Skipped: ${skipped}; Failed: ${failed}`);
            status(`成功：${succeeded} / スキップ：${skipped} / 失敗：${failed}\nMaterial以外：${items.length - materials.length}件無視${prepared.cross ? `\n別プロジェクト/ブランチ：参照変換 ${prepared.remapped}件` : ''}${missingNotice}${rollbackFailed ? `\n復元失敗：${rollbackFailed}件。Consoleを確認してください。` : ''}${grouped ? '' : '\n一括Undo非対応（通常の履歴のみ）'}`);
        } catch (error) { status(error.message); fail('Paste:', error); }
        finally { state.busy = false; }
    }

    // -------- UI (Shadow DOM isolates styles from Editor) --------
    function mount() {
        const host = document.createElement('div');
        host.id = 'pc-material-copy-tool';
        host.style.cssText = 'width:100%';
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
          :host{color-scheme:dark}*{box-sizing:border-box}section{width:285px;max-width:calc(100vw - 16px);background:#292d32;color:#e4e6e8;border:1px solid #545a61;border-radius:7px;box-shadow:0 6px 24px #0008;font:12px/1.5 system-ui,sans-serif}
          header{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;background:#343940;border-radius:7px 7px 0 0;cursor:move;touch-action:none;user-select:none}header strong{font-size:13px}button{font:inherit;color:inherit;background:#424a53;border:1px solid #646e79;border-radius:4px;padding:7px;cursor:pointer}button:hover{background:#52606e}button:focus-visible{outline:2px solid #77c8e8}header button{padding:0 7px;font-size:17px}main{padding:11px;max-height:calc(100vh - 75px);overflow:auto}main>button{width:100%;margin:7px 0}hr{border:0;border-top:1px solid #484e55;margin:10px 0}.muted{color:#aeb7c1}.name{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}ul{padding-left:18px;margin:5px 0;max-height:105px;overflow:auto;overflow-wrap:anywhere}label{display:flex;gap:7px;align-items:center;margin:7px 0}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:5px}[hidden]{display:none!important}
        </style><section aria-label="Material Copy Tool"><header><strong>Material Copy Tool</strong><button type="button" aria-label="最小化">−</button></header><main>
        <div class="muted">共有コピー元（別プロジェクト・別タブ対応）</div><div class="name" id="source">未設定</div><button id="copy" type="button">コピー元に設定</button><button id="clear" type="button">共有コピー元をクリア</button><div class="muted">別プロジェクトのTextureは、同名・同種類のAssetを自動アサインします（フォルダー不問）。名前は大文字・小文字も含め完全一致。見つからない参照は既存設定を維持して続行。同名候補が複数ある場合は中止します。</div><hr>
        <div class="muted">コピー先・現在選択</div><div id="count">0 Materials</div><ul id="targets"></ul><button id="paste" type="button">選択Materialへペースト</button><hr>
        <label><input id="confirm" type="checkbox">実行前に確認</label><div class="muted">Status:</div><output id="status" role="status" aria-live="polite">準備完了</output>
        </main></section>`;
        const q = selector => root.querySelector(selector);
        ui = { host, source: q('#source'), count: q('#count'), targets: q('#targets'), status: q('#status') };
        // Prevent Editor global shortcuts and click selection handlers from consuming panel events.
        for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'keyup', 'wheel'])
            root.addEventListener(event, e => e.stopPropagation());
        q('#copy').addEventListener('click', setSource);
        q('#clear').addEventListener('click', clearSource);
        q('#paste').addEventListener('click', paste);
        q('#confirm').checked = Boolean(prefs.confirm);
        q('#confirm').addEventListener('change', e => { prefs.confirm = e.target.checked; save(); });
        const minimize = () => {
            q('main').hidden = Boolean(prefs.minimized);
            q('header button').textContent = prefs.minimized ? '+' : '−';
            q('header button').setAttribute('aria-label', prefs.minimized ? '展開' : '最小化');
            q('header button').setAttribute('aria-expanded', String(!prefs.minimized));
            clamp();
        };
        q('header button').addEventListener('click', () => { prefs.minimized = !prefs.minimized; minimize(); save(); });
        ctx.container.append(host);
        const embeddedStyle = document.createElement('style');
        embeddedStyle.textContent = 'section{width:100%;max-width:none;border:0;box-shadow:none}header{display:none}main{max-height:none}';
        root.append(embeddedStyle);
        prefs.minimized = false;
        if (Number.isFinite(prefs.x) && Number.isFinite(prefs.y)) place(prefs.x, prefs.y);
        minimize();
        let drag;
        const header = q('header');
        header.addEventListener('pointerdown', e => {
            if (e.button !== 0 || e.target.closest('button')) return;
            const rect = host.getBoundingClientRect();
            drag = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
            header.setPointerCapture(e.pointerId); e.preventDefault();
        });
        header.addEventListener('pointermove', e => { if (drag) place(e.clientX - drag.dx, e.clientY - drag.dy); });
        const end = () => { if (!drag) return; drag = null; save(); };
        header.addEventListener('pointerup', end);
        header.addEventListener('pointercancel', end);
        header.addEventListener('lostpointercapture', end);
        log('Initialized');
    }
    function place(x, y) { return; // Position is owned by the toolkit shell.
        const rect = ui.host.getBoundingClientRect();
        prefs.x = Math.max(8, Math.min(x, innerWidth - rect.width - 8));
        prefs.y = Math.max(8, Math.min(y, innerHeight - rect.height - 8));
        Object.assign(ui.host.style, { left: `${prefs.x}px`, top: `${prefs.y}px`, right: 'auto', bottom: 'auto' });
    }
    function clamp() {
        if (!ui) return;
        const rect = ui.host.getBoundingClientRect(); place(rect.left, rect.top);
    }
    window.addEventListener('resize', () => { clamp(); save(); });
    let lastSelection = '';
    function renderSelection() {
        if (!ui || !state.adapter) return;
        const adapter = state.adapter;
        const materials = adapter.getSelectedMaterials();
        const rows = materials.map(a => ({ name: adapter.getAssetName(a), id: adapter.getAssetId(a) }));
        const signature = JSON.stringify([state.source?.id, state.source?.name, state.source?.scope, state.source?.copiedAt, rows]);
        if (lastSelection === signature) return;
        lastSelection = signature;
        ui.source.textContent = state.source ? `Material: ${state.source.name}\nID: ${state.source.id}\nProject: ${state.source.scope.project}\nBranch: ${state.source.scope.branch}` : '未設定';
        ui.count.textContent = `${rows.length} Materials`;
        ui.targets.replaceChildren(...rows.map(row => {
            const li = document.createElement('li');
            li.textContent = `${row.name}${state.source && sameScope(state.source.scope, adapter.scope()) && row.id === state.source.id ? '（コピー元・スキップ）' : ''}`;
            li.title = `ID: ${row.id}`; return li;
        }));
    }
    let lastInitError = '';
    function tick() {
        try {
            if (!document.body || !window.editor) { if (ui) ui.host.hidden = true; return; }
            const adapter = state.adapter?.editor === window.editor ? state.adapter : new Adapter(window.editor);
            if (!adapter.ready()) { if (ui) ui.host.hidden = true; return; }
            const context = adapter.context();
            if (adapter !== state.adapter || context !== state.context) {
                state.adapter = adapter; state.context = context; lastSelection = '';
                status('共有コピー元を利用できます。コピー先Materialを選択してください。');
            }
            if (!ui) mount();
            else if (!ui.host.isConnected) ctx.container.append(ui.host);
            ui.host.hidden = false;
            syncClipboard();
            renderSelection();
            lastInitError = '';
        } catch (error) {
            if (error.message !== lastInitError) { fail('Initialization/selection:', error); lastInitError = error.message; }
            status(`Editorの準備待ち：${error.message}`);
        }
    }
    const receive = () => {
        try { if (state.adapter && !state.busy) syncClipboard(true); }
        catch (error) { status(error.message); fail('Clipboard sync:', error); }
    };
    window.addEventListener('storage', event => { if (event.key === CLIPBOARD || event.key === null) receive(); });
    window.addEventListener('focus', receive);
    ctx.hooks.isBusy = () => state.busy;
    tick();
    // Polling also supports late injection and SPA replacement without accumulating listeners.
    state.timer = window.setInterval(tick, 750);

 }
});


// Adapted from the supplied userscript; material operations stay local to this module.
Toolkit.register({
 id: "material-sync",
 title: "同名Material 同期",
 description: "同名グループを同期。Auto Syncは切り替え・最小化時にOFFになります。",
 mount(ctx) {

  'use strict';

  const SCRIPT_ID = 'pc-material-sync';
  const POSITION_STORAGE_KEY = 'pc-material-sync-position';
  const AUTO_SYNC_DEBOUNCE_MS = 400;
  const POLL_INTERVAL_MS = 1000;
  const EDITOR_SELECTION_POLL_INTERVAL_MS = 700;

  const state = {
    editor: null,
    groups: [],
    selectedGroupName: '',
    selectedSourceId: '',
    searchText: '',
    autoSyncEnabled: false,
    copyTextureReferences: true,
    collapsed: false,
    scanCompleted: false,
    drag: null,
    isSyncing: false,
    pendingAutoSync: false,
    hasConfirmedFirstSync: false,
    lastBackup: null,
    autoSyncTimer: 0,
    verifyTimers: [],
    pollTimer: 0,
    editorSelectionPollTimer: 0,
    lastEditorSelectedAssetId: '',
    sourceSignature: '',
    detachSourceWatchers: [],
    detachEditorSelectionWatchers: []
  };

  const ui = {};
  let visible = true;

  const STYLE_TEXT = `
    #${SCRIPT_ID} {
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 2147483647;
      width: 360px;
      max-width: calc(100vw - 24px);
      color: #e8edf2;
      background: #171b20;
      border: 1px solid #343b45;
      border-radius: 8px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.36);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 12px;
      line-height: 1.35;
    }
    #${SCRIPT_ID} * {
      box-sizing: border-box;
    }
    #${SCRIPT_ID} button,
    #${SCRIPT_ID} input,
    #${SCRIPT_ID} select {
      font: inherit;
    }
    #${SCRIPT_ID} .pms-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-height: 34px;
      padding: 7px 9px;
      border-bottom: 1px solid #2c333d;
      cursor: move;
      user-select: none;
      touch-action: none;
    }
    #${SCRIPT_ID} .pms-title {
      font-weight: 700;
      letter-spacing: 0;
    }
    #${SCRIPT_ID} .pms-header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: default;
    }
    #${SCRIPT_ID} .pms-pill {
      color: #9fb0c2;
      font-size: 11px;
      white-space: nowrap;
    }
    #${SCRIPT_ID} .pms-toggle {
      width: 24px;
      height: 22px;
      padding: 0;
      color: #d8e0e8;
      background: #222831;
      border: 1px solid #3a4350;
      border-radius: 5px;
      cursor: pointer;
    }
    #${SCRIPT_ID} .pms-body {
      padding: 9px;
    }
    #${SCRIPT_ID}.is-collapsed .pms-body {
      display: none;
    }
    #${SCRIPT_ID}.is-dragging {
      user-select: none;
    }
    #${SCRIPT_ID} .pms-row {
      display: flex;
      gap: 6px;
      align-items: center;
      margin-bottom: 7px;
    }
    #${SCRIPT_ID} .pms-row-wrap {
      flex-wrap: wrap;
    }
    #${SCRIPT_ID} .pms-search {
      flex: 1;
      min-width: 120px;
      height: 28px;
      color: #e8edf2;
      background: #0f1216;
      border: 1px solid #343b45;
      border-radius: 5px;
      padding: 0 8px;
      outline: none;
    }
    #${SCRIPT_ID} .pms-search:focus,
    #${SCRIPT_ID} select:focus {
      border-color: #5a8fdc;
    }
    #${SCRIPT_ID} .pms-button {
      height: 28px;
      padding: 0 9px;
      color: #eaf1f7;
      background: #253142;
      border: 1px solid #405066;
      border-radius: 5px;
      cursor: pointer;
      white-space: nowrap;
    }
    #${SCRIPT_ID} .pms-button:hover {
      background: #30405a;
    }
    #${SCRIPT_ID} .pms-button-primary {
      background: #235a9f;
      border-color: #3974bd;
    }
    #${SCRIPT_ID} .pms-button-primary:hover {
      background: #2b6dbc;
    }
    #${SCRIPT_ID} .pms-button-danger {
      background: #5b2b31;
      border-color: #7b3b43;
    }
    #${SCRIPT_ID} .pms-check {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      color: #c8d3dd;
      user-select: none;
      white-space: nowrap;
    }
    #${SCRIPT_ID} .pms-check input {
      margin: 0;
    }
    #${SCRIPT_ID} .pms-section {
      margin-top: 9px;
      padding-top: 9px;
      border-top: 1px solid #2c333d;
    }
    #${SCRIPT_ID} .pms-section-title {
      margin-bottom: 6px;
      color: #b8c6d3;
      font-weight: 700;
    }
    #${SCRIPT_ID} .pms-groups {
      max-height: 210px;
      overflow: auto;
      border: 1px solid #2c333d;
      border-radius: 6px;
      background: #11151a;
    }
    #${SCRIPT_ID} .pms-group {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 6px;
      padding: 7px;
      border-bottom: 1px solid #242a32;
    }
    #${SCRIPT_ID} .pms-group:last-child {
      border-bottom: 0;
    }
    #${SCRIPT_ID} .pms-group.is-selected {
      background: #1c2836;
    }
    #${SCRIPT_ID} .pms-group-name {
      overflow: hidden;
      color: #edf4fb;
      font-weight: 700;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    #${SCRIPT_ID} .pms-muted,
    #${SCRIPT_ID} .pms-ids {
      color: #9fb0c2;
      font-size: 11px;
    }
    #${SCRIPT_ID} .pms-ids {
      margin-top: 3px;
      word-break: break-word;
    }
    #${SCRIPT_ID} .pms-select-button {
      height: 24px;
      padding: 0 8px;
    }
    #${SCRIPT_ID} select {
      min-width: 0;
      height: 28px;
      color: #e8edf2;
      background: #0f1216;
      border: 1px solid #343b45;
      border-radius: 5px;
      padding: 0 6px;
      outline: none;
    }
    #${SCRIPT_ID} .pms-selected-grid {
      display: grid;
      grid-template-columns: 80px minmax(0, 1fr);
      gap: 6px;
      align-items: center;
    }
    #${SCRIPT_ID} .pms-selected-grid label {
      color: #9fb0c2;
    }
    #${SCRIPT_ID} .pms-log {
      height: 118px;
      overflow: auto;
      padding: 7px;
      color: #cbd6df;
      background: #0c0f13;
      border: 1px solid #2c333d;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    #${SCRIPT_ID} .pms-empty {
      padding: 9px;
      color: #94a4b4;
    }
  `;

  function getHostWindow() {
    try {
      if (typeof unsafeWindow !== 'undefined' && unsafeWindow) {
        return unsafeWindow;
      }
    } catch (error) {
      // unsafeWindow が使えない場合は通常の window を使う。
    }
    return window;
  }

  function getEditorObject() {
    const hostWindow = getHostWindow();
    return hostWindow.editor || window.editor || null;
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function log(message, level) {
    const line = `[${formatTime(new Date())}] ${message}`;
    if (ui.log) {
      const entry = document.createElement('div');
      entry.textContent = line;
      if (level === 'error') entry.style.color = '#ffb3b3';
      if (level === 'warn') entry.style.color = '#ffd28a';
      ui.log.appendChild(entry);
      ui.log.scrollTop = ui.log.scrollHeight;
    }
    const prefix = '[Material Sync]';
    if (level === 'error') {
      console.error(prefix, message);
    } else if (level === 'warn') {
      console.warn(prefix, message);
    } else {
      console.log(prefix, message);
    }
  }

  function deepClone(value) {
    if (value == null || typeof value !== 'object') return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      if (Array.isArray(value)) return value.map(deepClone);
      const copy = {};
      Object.keys(value).forEach((key) => {
        copy[key] = deepClone(value[key]);
      });
      return copy;
    }
  }

  function stableStringify(value) {
    const seen = new WeakSet();
    function normalize(item) {
      if (item == null || typeof item !== 'object') return item;
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
      if (Array.isArray(item)) return item.map(normalize);
      const output = {};
      Object.keys(item).sort().forEach((key) => {
        output[key] = normalize(item[key]);
      });
      return output;
    }
    try {
      return JSON.stringify(normalize(value));
    } catch (error) {
      return String(Date.now());
    }
  }

  function getFromPlainObject(object, path) {
    if (!object || !path) return undefined;
    return path.split('.').reduce((current, key) => {
      if (current == null) return undefined;
      return current[key];
    }, object);
  }

  function setOnPlainObject(object, path, value) {
    const parts = path.split('.');
    let current = object;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      if (!current[key] || typeof current[key] !== 'object') current[key] = {};
      current = current[key];
    }
    current[parts[parts.length - 1]] = value;
  }

  function assetJson(asset) {
    if (!asset) return {};
    try {
      if (typeof asset.json === 'function') return asset.json() || {};
    } catch (error) {
      log(`asset.json() に失敗しました: ${error.message}`, 'warn');
    }
    try {
      if (typeof asset.toJSON === 'function') return asset.toJSON() || {};
    } catch (error) {
      log(`asset.toJSON() に失敗しました: ${error.message}`, 'warn');
    }
    return asset;
  }

  function assetGet(asset, path) {
    if (!asset) return undefined;
    try {
      if (typeof asset.get === 'function') {
        const value = asset.get(path);
        if (value !== undefined) return value;
      }
    } catch (error) {
      log(`asset.get('${path}') に失敗しました: ${error.message}`, 'warn');
    }
    return getFromPlainObject(assetJson(asset), path);
  }

  function assetSet(asset, path, value) {
    if (!asset) return false;
    try {
      if (typeof asset.set === 'function') {
        // PlayCanvas Editor API の Asset#set(path, value) を優先する。
        // 公式 API では Observer/History と連携するため、Editor 側の UI 更新や保存に乗りやすい。
        return asset.set(path, value);
      }
    } catch (error) {
      log(`asset.set('${path}') に失敗しました: ${error.message}`, 'error');
      return false;
    }
    try {
      setOnPlainObject(asset, path, value);
      return true;
    } catch (error) {
      log(`asset の直接更新に失敗しました: ${error.message}`, 'error');
      return false;
    }
  }

  function assetUnset(asset, path) {
    if (!asset) return false;
    try {
      if (typeof asset.unset === 'function') {
        return asset.unset(path);
      }
    } catch (error) {
      log(`asset.unset('${path}') に失敗しました: ${error.message}`, 'warn');
      return false;
    }
    try {
      const parts = path.split('.');
      const key = parts.pop();
      const parent = getFromPlainObject(asset, parts.join('.'));
      if (parent && Object.prototype.hasOwnProperty.call(parent, key)) {
        delete parent[key];
      }
      return true;
    } catch (error) {
      log(`asset の直接 unset に失敗しました: ${error.message}`, 'warn');
      return false;
    }
  }

  function isPlainObject(value) {
    return value != null && typeof value === 'object' && !Array.isArray(value);
  }

  function flattenObjectPaths(value, prefix, output) {
    if (!isPlainObject(value)) {
      output.push({ path: prefix, value });
      return output;
    }

    const keys = Object.keys(value);
    if (!keys.length) {
      output.push({ path: prefix, value: {} });
      return output;
    }

    keys.forEach((key) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      flattenObjectPaths(value[key], nextPath, output);
    });
    return output;
  }

  function collectObjectPaths(value, prefix, output) {
    if (!isPlainObject(value)) return output;
    Object.keys(value).forEach((key) => {
      const nextPath = prefix ? `${prefix}.${key}` : key;
      output.add(nextPath);
      collectObjectPaths(value[key], nextPath, output);
    });
    return output;
  }

  function getAssetId(asset) {
    const id = assetGet(asset, 'id');
    return id == null ? '' : String(id);
  }

  function getAssetName(asset) {
    const name = assetGet(asset, 'name');
    return name == null ? '' : String(name);
  }

  function getAssetType(asset) {
    const type = assetGet(asset, 'type');
    return type == null ? '' : String(type);
  }

  function getAssetData(asset) {
    const data = assetGet(asset, 'data');
    return data && typeof data === 'object' ? data : {};
  }

  function normalizeAssetList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'object') return Object.keys(value).map((key) => value[key]).filter(Boolean);
    return [];
  }

  function callEditor(editor, methodName) {
    if (!editor || typeof editor.call !== 'function') {
      throw new Error('editor.call が利用できません');
    }
    const args = Array.prototype.slice.call(arguments, 2);
    return editor.call.apply(editor, [methodName].concat(args));
  }

  function selectAssetInEditor(asset, reason) {
    const editor = getEditorObject();
    if (!editor || !asset) {
      log('Editor 上で source material を選択できません: editor または asset が見つかりません', 'warn');
      return false;
    }

    const assetId = getAssetId(asset);
    const attempts = [];

    // 現行の公開ベータ Editor API。Selection#set(items, options) で Editor 内の選択を更新する。
    // history:false にして、マテリアル同期ツールの source 切替だけで Editor の履歴を汚さない。
    if (editor.api && editor.api.globals && editor.api.globals.selection && typeof editor.api.globals.selection.set === 'function') {
      attempts.push({
        name: 'editor.api.globals.selection.set([asset])',
        run: () => editor.api.globals.selection.set([asset], { history: false })
      });
    }

    // 環境によっては globals 経由ではなく editor.selection として公開されている。
    if (editor.selection && typeof editor.selection.set === 'function') {
      attempts.push({
        name: 'editor.selection.set([asset])',
        run: () => editor.selection.set([asset], { history: false })
      });
    }

    // 旧 Editor 内部 API の代表的な選択変更メソッド。
    if (typeof editor.call === 'function') {
      attempts.push({
        name: "editor.call('selector:set', 'asset', [asset])",
        run: () => callEditor(editor, 'selector:set', 'asset', [asset])
      });
    }

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        attempt.run();
        log(`${reason || 'Source select'}: PlayCanvas Editor で asset id=${assetId} を選択しました (${attempt.name})`);
        return true;
      } catch (error) {
        log(`Editor 選択 API 失敗 (${attempt.name}): ${error.message}`, 'warn');
      }
    }

    log('Editor 上で source material を選択できません: 利用可能な selection API がありません', 'warn');
    return false;
  }

  function normalizeSelectionItems(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return [value].filter(Boolean);
  }

  function getEditorSelectedItems() {
    const editor = getEditorObject();
    if (!editor) return [];

    const attempts = [];

    // 現行の公開ベータ Editor API。Selection#items で Editor 内の現在選択を取得する。
    if (editor.api && editor.api.globals && editor.api.globals.selection) {
      attempts.push({
        name: 'editor.api.globals.selection.items',
        run: () => editor.api.globals.selection.items
      });
    }

    if (editor.selection) {
      attempts.push({
        name: 'editor.selection.items',
        run: () => editor.selection.items
      });
    }

    // 旧 Editor 内部 API の選択取得メソッド。
    if (typeof editor.call === 'function') {
      attempts.push({
        name: "editor.call('selector:items')",
        run: () => callEditor(editor, 'selector:items')
      });
    }

    for (let index = 0; index < attempts.length; index += 1) {
      try {
        const items = normalizeSelectionItems(attempts[index].run());
        if (items.length) return items;
      } catch (error) {
        // 選択状態のポーリングでログが埋まらないよう、ここでは黙って次候補へ進む。
      }
    }

    return [];
  }

  function findSelectedMaterialAsset() {
    const items = getEditorSelectedItems();
    return items.find((item) => getAssetType(item) === 'material') || null;
  }

  function syncPanelToEditorSelectedMaterial(reason) {
    if (!visible) return false;
    const selectedAsset = findSelectedMaterialAsset();
    if (!selectedAsset) {
      state.lastEditorSelectedAssetId = '';
      return false;
    }

    const selectedAssetId = getAssetId(selectedAsset);
    const selectedName = getAssetName(selectedAsset);
    const alreadySelected = state.selectedGroupName === selectedName && String(state.selectedSourceId) === selectedAssetId;

    if (alreadySelected) {
      state.lastEditorSelectedAssetId = selectedAssetId;
      return true;
    }

    const group = findGroupByName(selectedName);
    if (!group) {
      if (state.scanCompleted && state.lastEditorSelectedAssetId !== selectedAssetId) {
        log(`Editor 選択: asset id=${selectedAssetId} は同名 material グループ対象外です`, 'warn');
      }
      state.lastEditorSelectedAssetId = selectedAssetId;
      return false;
    }

    if (!findAssetInGroup(group, selectedAssetId)) {
      if (state.lastEditorSelectedAssetId !== selectedAssetId) {
        log(`Editor 選択: "${selectedName}" の asset id=${selectedAssetId} を現在のグループ内に見つけられません`, 'warn');
      }
      state.lastEditorSelectedAssetId = selectedAssetId;
      return false;
    }

    state.selectedGroupName = group.name;
    state.selectedSourceId = selectedAssetId;
    state.lastEditorSelectedAssetId = selectedAssetId;
    log(`Editor 選択に追従: ${group.name} / source id=${selectedAssetId} (${reason || 'selection'})`);
    renderGroups();
    renderSelectedGroup();
    attachAutoSyncWatchers();
    return true;
  }

  function detachEditorSelectionWatchers() {
    state.detachEditorSelectionWatchers.forEach((detach) => {
      try {
        detach();
      } catch (error) {
        log(`selection watcher 解除に失敗しました: ${error.message}`, 'warn');
      }
    });
    state.detachEditorSelectionWatchers = [];
  }

  function addEditorSelectionWatcher(target, eventName, handler) {
    if (!target || typeof target.on !== 'function') return;
    try {
      const subscription = target.on(eventName, handler);
      if (subscription && typeof subscription.unbind === 'function') {
        state.detachEditorSelectionWatchers.push(() => subscription.unbind());
      } else if (typeof target.off === 'function') {
        state.detachEditorSelectionWatchers.push(() => target.off(eventName, handler));
      }
    } catch (error) {
      // 非公開イベント名は環境によって存在しないため、失敗しても継続する。
    }
  }

  function startEditorSelectionSync() {
    detachEditorSelectionWatchers();

    if (state.editorSelectionPollTimer) {
      window.clearInterval(state.editorSelectionPollTimer);
      state.editorSelectionPollTimer = 0;
    }

    const editor = getEditorObject();
    const handler = () => {
      window.setTimeout(() => syncPanelToEditorSelectedMaterial('editor event'), 0);
    };

    if (editor) {
      const selection = editor.api && editor.api.globals && editor.api.globals.selection
        ? editor.api.globals.selection
        : editor.selection;

      addEditorSelectionWatcher(selection, 'change', handler);
      addEditorSelectionWatcher(selection, 'set', handler);
      addEditorSelectionWatcher(selection, 'add', handler);
      addEditorSelectionWatcher(selection, 'remove', handler);
      addEditorSelectionWatcher(selection, 'clear', handler);

      // 旧 Editor 内部 API 側で観測されることがある選択イベント候補。
      addEditorSelectionWatcher(editor, 'selector:set', handler);
      addEditorSelectionWatcher(editor, 'selector:change', handler);
      addEditorSelectionWatcher(editor, 'selection:toggle', handler);
    }

    state.editorSelectionPollTimer = window.setInterval(() => {
      syncPanelToEditorSelectedMaterial('poll');
    }, EDITOR_SELECTION_POLL_INTERVAL_MS);

    syncPanelToEditorSelectedMaterial('initial');
  }

  function getAllAssets() {
    const editor = getEditorObject();
    state.editor = editor;

    if (!editor) {
      throw new Error('Editor APIを取得できません: window.editor / unsafeWindow.editor が見つかりません');
    }

    const attempts = [];

    // 現行の公開ベータ Editor API。公式ドキュメントでは editor.api.globals.assets.list() が利用例に出ている。
    if (editor.api && editor.api.globals && editor.api.globals.assets) {
      const apiAssets = editor.api.globals.assets;
      if (typeof apiAssets.list === 'function') {
        attempts.push({
          name: 'editor.api.globals.assets.list()',
          run: () => apiAssets.list()
        });
      }
      if (typeof apiAssets.filter === 'function') {
        attempts.push({
          name: 'editor.api.globals.assets.filter(() => true)',
          run: () => apiAssets.filter(() => true)
        });
      }
    }

    // 旧 Editor 内部 API の代表的な候補。環境によっては editor.call('assets:list') が使える。
    if (typeof editor.call === 'function') {
      attempts.push({
        name: "editor.call('assets:list')",
        run: () => callEditor(editor, 'assets:list')
      });
      attempts.push({
        name: "editor.call('assets:find')",
        run: () => callEditor(editor, 'assets:find')
      });
    }

    if (editor.assets && typeof editor.assets.list === 'function') {
      attempts.push({
        name: 'editor.assets.list()',
        run: () => editor.assets.list()
      });
    }

    const errors = [];
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const assets = normalizeAssetList(attempt.run());
        if (assets.length > 0) {
          log(`${attempt.name} から ${assets.length} 件の asset を取得しました`);
          return assets;
        }
        errors.push(`${attempt.name}: 0 件`);
      } catch (error) {
        errors.push(`${attempt.name}: ${error.message}`);
      }
    }

    if (!attempts.length) {
      throw new Error('Editor APIを取得できません: assets API の候補が見つかりません');
    }
    throw new Error(`material asset一覧を取得できません: ${errors.join(' / ')}`);
  }

  function buildMaterialGroups(assets) {
    const map = new Map();

    assets.forEach((asset) => {
      const type = getAssetType(asset);
      if (type !== 'material') return;

      const name = getAssetName(asset);
      if (!name) return;

      if (!map.has(name)) map.set(name, []);
      map.get(name).push(asset);
    });

    return Array.from(map.entries())
      .filter((entry) => entry[1].length >= 2)
      .map(([name, assetsInGroup]) => ({
        name,
        assets: assetsInGroup,
        ids: assetsInGroup.map(getAssetId).filter(Boolean)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function findGroupByName(name) {
    return state.groups.find((group) => group.name === name) || null;
  }

  function findAssetInGroup(group, assetId) {
    if (!group) return null;
    return group.assets.find((asset) => getAssetId(asset) === String(assetId)) || null;
  }

  function isTextureReferenceKey(key) {
    const normalized = String(key).toLowerCase();
    if (normalized.endsWith('maptiling') || normalized.endsWith('mapoffset') || normalized.endsWith('maprotation')) {
      return false;
    }
    if (normalized === 'mapping') return false;
    return (
      normalized.endsWith('map') ||
      normalized.endsWith('maps') ||
      normalized.includes('texture') ||
      normalized.includes('cubemap') ||
      normalized.includes('envatlas')
    );
  }

  function removeTextureReferences(value) {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(removeTextureReferences);

    const copy = {};
    Object.keys(value).forEach((key) => {
      if (isTextureReferenceKey(key)) return;
      copy[key] = removeTextureReferences(value[key]);
    });
    return copy;
  }

  function makeCopyableMaterialData(sourceAsset) {
    // asset id/name/path/tags 等は asset 直下のメタ情報なので、asset.data のみをコピーする。
    const sourceData = deepClone(getAssetData(sourceAsset));
    if (state.copyTextureReferences) return sourceData;
    return removeTextureReferences(sourceData);
  }

  function isSkippableTexturePath(path) {
    return path.split('.').some(isTextureReferenceKey);
  }

  function applyMaterialDataPatch(targetAsset, nextData) {
    const targetData = getAssetData(targetAsset);
    const nextLeaves = flattenObjectPaths(nextData, '', []);
    const nextLeafPaths = new Set(nextLeaves.map((entry) => entry.path));
    let changed = false;
    let failed = false;

    // Copy texture references が ON の時だけ、source に存在しない data leaf を target 側から消す。
    // OFF の時は既存の texture map 参照などを保つため、未指定キーは触らない。
    if (state.copyTextureReferences) {
      flattenObjectPaths(targetData, '', []).forEach((entry) => {
        if (!entry.path || nextLeafPaths.has(entry.path)) return;
        const result = assetUnset(targetAsset, `data.${entry.path}`);
        if (result !== false) changed = true;
      });
    }

    nextLeaves.forEach((entry) => {
      if (!entry.path) return;
      if (!state.copyTextureReferences && isSkippableTexturePath(entry.path)) return;

      const currentValue = getFromPlainObject(getAssetData(targetAsset), entry.path);
      const nextValue = deepClone(entry.value);
      if (stableStringify(currentValue) === stableStringify(nextValue)) return;

      const result = assetSet(targetAsset, `data.${entry.path}`, nextValue);
      if (result === false) {
        failed = true;
      } else {
        changed = true;
      }
    });

    return failed ? false : true;
  }

  function materialDataMatchesExpected(targetAsset, expectedData) {
    const expectedLeaves = flattenObjectPaths(expectedData, '', []);
    const targetData = getAssetData(targetAsset);

    return expectedLeaves.every((entry) => {
      if (!entry.path) return true;
      if (!state.copyTextureReferences && isSkippableTexturePath(entry.path)) return true;
      const actualValue = getFromPlainObject(targetData, entry.path);
      return stableStringify(actualValue) === stableStringify(entry.value);
    });
  }

  function clearVerifyTimers() {
    state.verifyTimers.forEach((timerId) => window.clearTimeout(timerId));
    state.verifyTimers = [];
  }

  function schedulePostSyncVerification(groupName, sourceId) {
    clearVerifyTimers();

    [180, 650, 1400].forEach((delay) => {
      const timerId = window.setTimeout(() => {
        state.verifyTimers = state.verifyTimers.filter((id) => id !== timerId);
        if (state.isSyncing || !writable()) return;

        const group = findGroupByName(groupName);
        const sourceAsset = findAssetInGroup(group, sourceId);
        if (!group || !sourceAsset) return;

        const latestData = makeCopyableMaterialData(sourceAsset);
        const targetAssets = group.assets.filter((asset) => getAssetId(asset) !== String(sourceId));
        const staleTargets = targetAssets.filter((asset) => !materialDataMatchesExpected(asset, latestData));

        if (!staleTargets.length) return;

        state.isSyncing = true;
        try {
          staleTargets.forEach((target) => {
            applyMaterialDataPatch(target, deepClone(latestData));
            log(`Verify Sync: source id=${sourceId} -> target id=${getAssetId(target)} を再適用しました`);
          });
          state.sourceSignature = stableStringify(latestData);
        } catch (error) {
          log(`Verify Sync 中にエラーが発生しました: ${error.message}`, 'error');
        } finally {
          state.isSyncing = false;
        }
      }, delay);

      state.verifyTimers.push(timerId);
    });
  }

  function createBackup(group) {
    return {
      groupName: group.name,
      createdAt: new Date().toISOString(),
      items: group.assets.map((asset) => ({
        id: getAssetId(asset),
        name: getAssetName(asset),
        data: deepClone(getAssetData(asset))
      }))
    };
  }

  function restoreBackup() {
    stopBackgroundSync();
    if (!writable()) return;
    if (!state.lastBackup) {
      log('戻せる同期履歴がありません', 'warn');
      return;
    }

    const group = findGroupByName(state.lastBackup.groupName);
    if (!group) {
      log(`Undo 失敗: グループ "${state.lastBackup.groupName}" が現在の一覧にありません`, 'error');
      return;
    }

    state.isSyncing = true;
    try {
      let restoredCount = 0;
      state.lastBackup.items.forEach((item) => {
        const asset = findAssetInGroup(group, item.id);
        if (!asset) {
          log(`Undo 対象 asset id=${item.id} が見つかりません`, 'warn');
          return;
        }
        if (assetSet(asset, 'data', deepClone(item.data)) !== false) {
          restoredCount += 1;
          log(`Undo: asset id=${item.id} を同期前 data に戻しました`);
        }
      });
      log(`Undo 完了: ${restoredCount} 件を復元しました`);
      updateSourceSignature();
    } finally {
      state.isSyncing = false;
    }
  }

  function confirmFirstSyncIfNeeded(group) {
    if (state.hasConfirmedFirstSync) return true;
    const message = [
      'Material Sync: 初回同期の確認',
      '',
      `選択中の同名マテリアル "${group.name}" (${group.assets.length} 件) に対して、`,
      '基準マテリアルの asset.data を他の同名マテリアルへ反映します。',
      '',
      '同名でも意図的に別設定の場合があります。続行しますか？'
    ].join('\n');
    const approved = window.confirm(message);
    if (approved) {
      state.hasConfirmedFirstSync = true;
      log('初回同期確認が承認されました');
    } else {
      log('初回同期確認がキャンセルされました', 'warn');
    }
    return approved;
  }

  function syncSelectedGroup(trigger) {
    if (!writable()) return;
    const group = findGroupByName(state.selectedGroupName);
    if (!group) {
      log('同期対象グループが選択されていません', 'warn');
      return;
    }

    const sourceAsset = findAssetInGroup(group, state.selectedSourceId) || group.assets[0];
    if (!sourceAsset) {
      log('基準マテリアルが見つかりません', 'error');
      return;
    }

    if (!confirmFirstSyncIfNeeded(group)) return;

    const sourceId = getAssetId(sourceAsset);
    const nextData = makeCopyableMaterialData(sourceAsset);
    const nextSignature = stableStringify(nextData);
    const targets = group.assets.filter((asset) => getAssetId(asset) !== sourceId);

    if (!targets.length) {
      log('同期先マテリアルがありません', 'warn');
      return;
    }

    state.isSyncing = true;
    state.lastBackup = createBackup(group);
    renderSelectedGroup();

    try {
      let updatedCount = 0;
      targets.forEach((target) => {
        const targetId = getAssetId(target);
        const copiedData = deepClone(nextData);
        const result = applyMaterialDataPatch(target, copiedData);
        if (result !== false) {
          updatedCount += 1;
          log(`${trigger || 'Sync'}: source id=${sourceId} -> target id=${targetId}`);
        } else {
          log(`同期に失敗しました: target id=${targetId}`, 'error');
        }
      });

      // asset.set('data.xxx', value) の個別更新を使う。Editor のスライダー操作中は data 丸ごと置換が
      // 後続の Editor 更新で戻されることがあるため、Observer の通常変更パスに近い形で反映する。
      log(`同期完了: ${updatedCount}/${targets.length} 件を更新しました`);
      state.sourceSignature = nextSignature;
      schedulePostSyncVerification(group.name, sourceId);
    } catch (error) {
      log(`同期中にエラーが発生しました: ${error.message}`, 'error');
    } finally {
      state.isSyncing = false;
      const currentSignature = getCopyableSourceSignature(sourceAsset);
      const needsFollowUpSync = state.autoSyncEnabled && (
        state.pendingAutoSync ||
        (nextSignature && currentSignature && currentSignature !== nextSignature)
      );
      state.pendingAutoSync = false;
      if (needsFollowUpSync) {
        log('Auto Sync: 同期中に追加変更を検出したため再同期を予約しました');
        scheduleAutoSync('queued change');
      }
    }
  }

  function clearAutoSyncTimer() {
    if (state.autoSyncTimer) {
      window.clearTimeout(state.autoSyncTimer);
      state.autoSyncTimer = 0;
    }
  }

  function scheduleAutoSync(reason) {
    if (!state.autoSyncEnabled) return;
    if (state.isSyncing) {
      state.pendingAutoSync = true;
      return;
    }
    const group = findGroupByName(state.selectedGroupName);
    if (!group) return;

    clearAutoSyncTimer();
    state.autoSyncTimer = window.setTimeout(() => {
      state.autoSyncTimer = 0;
      if (!state.autoSyncEnabled) return;
      if (state.isSyncing) {
        state.pendingAutoSync = true;
        return;
      }
      log(`Auto Sync: 基準マテリアル変更を検出しました (${reason})`);
      syncSelectedGroup('Auto Sync');
    }, AUTO_SYNC_DEBOUNCE_MS);
  }

  function detachSourceWatchers() {
    state.detachSourceWatchers.forEach((detach) => {
      try {
        detach();
      } catch (error) {
        log(`watcher 解除に失敗しました: ${error.message}`, 'warn');
      }
    });
    state.detachSourceWatchers = [];
  }

  function addSourceWatcher(asset, eventName, handler) {
    if (!asset || typeof asset.on !== 'function') return;
    try {
      const subscription = asset.on(eventName, handler);
      if (subscription && typeof subscription.unbind === 'function') {
        state.detachSourceWatchers.push(() => subscription.unbind());
      } else if (typeof asset.off === 'function') {
        state.detachSourceWatchers.push(() => asset.off(eventName, handler));
      }
    } catch (error) {
      log(`source watcher '${eventName}' の登録に失敗しました: ${error.message}`, 'warn');
    }
  }

  function updateSourceSignature() {
    const group = findGroupByName(state.selectedGroupName);
    const sourceAsset = findAssetInGroup(group, state.selectedSourceId);
    state.sourceSignature = sourceAsset ? getCopyableSourceSignature(sourceAsset) : '';
  }

  function getCopyableSourceSignature(sourceAsset) {
    return sourceAsset ? stableStringify(makeCopyableMaterialData(sourceAsset)) : '';
  }

  function startPollingSource() {
    if (state.pollTimer) {
      window.clearInterval(state.pollTimer);
      state.pollTimer = 0;
    }

    if (!state.autoSyncEnabled) return;

    state.pollTimer = window.setInterval(() => {
      if (!state.autoSyncEnabled || state.isSyncing) return;
      const group = findGroupByName(state.selectedGroupName);
      const sourceAsset = findAssetInGroup(group, state.selectedSourceId);
      if (!sourceAsset) return;

      const signature = getCopyableSourceSignature(sourceAsset);
      if (state.sourceSignature && signature !== state.sourceSignature) {
        scheduleAutoSync('poll');
      } else if (!state.sourceSignature) {
        state.sourceSignature = signature;
      }
    }, POLL_INTERVAL_MS);
  }

  function attachAutoSyncWatchers() {
    detachSourceWatchers();
    clearAutoSyncTimer();
    clearVerifyTimers();
    state.pendingAutoSync = false;

    const group = findGroupByName(state.selectedGroupName);
    const sourceAsset = findAssetInGroup(group, state.selectedSourceId);
    updateSourceSignature();

    if (!state.autoSyncEnabled || !sourceAsset) {
      startPollingSource();
      return;
    }

    const handler = function () {
      scheduleAutoSync('asset event');
    };

    // PlayCanvas の内部 Observer/Event 名は環境差があるため、代表的な変更イベントだけを安全に試す。
    addSourceWatcher(sourceAsset, 'change', handler);
    addSourceWatcher(sourceAsset, 'set', handler);
    addSourceWatcher(sourceAsset, '*:set', handler);
    addSourceWatcher(sourceAsset, 'data:set', handler);

    startPollingSource();
    log(`Auto Sync watcher を source id=${getAssetId(sourceAsset)} に設定しました`);
  }

  function scanMaterials() {
    try {
      const assets = getAllAssets();
      state.groups = buildMaterialGroups(assets);
      state.scanCompleted = true;

      const selectedStillExists = state.groups.some((group) => group.name === state.selectedGroupName);
      if (!selectedStillExists) {
        state.selectedGroupName = state.groups[0] ? state.groups[0].name : '';
        state.selectedSourceId = state.groups[0] && state.groups[0].ids[0] ? state.groups[0].ids[0] : '';
      } else {
        const group = findGroupByName(state.selectedGroupName);
        const sourceStillExists = group && group.ids.includes(String(state.selectedSourceId));
        if (!sourceStillExists) state.selectedSourceId = group && group.ids[0] ? group.ids[0] : '';
      }

      log(`Scan 完了: 同名 material グループ ${state.groups.length} 件`);
      if (ui.status) ui.status.textContent = `${state.groups.length} groups`;
      renderGroups();
      renderSelectedGroup();
      attachAutoSyncWatchers();
      startEditorSelectionSync();
    } catch (error) {
      state.groups = [];
      state.scanCompleted = false;
      if (ui.status) ui.status.textContent = 'API error';
      renderGroups();
      renderSelectedGroup();
      log(error.message || String(error), 'error');
    }
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function renderGroups() {
    if (!ui.groups) return;
    ui.groups.textContent = '';

    const query = state.searchText.trim().toLowerCase();
    const filtered = state.groups.filter((group) => !query || group.name.toLowerCase().includes(query));

    if (!filtered.length) {
      const empty = createElement('div', 'pms-empty', state.groups.length ? '一致するグループがありません' : '同名 material は見つかっていません');
      ui.groups.appendChild(empty);
      return;
    }

    filtered.forEach((group) => {
      const row = createElement('div', 'pms-group');
      if (group.name === state.selectedGroupName) row.classList.add('is-selected');

      const info = createElement('div');
      info.appendChild(createElement('div', 'pms-group-name', group.name));
      info.appendChild(createElement('div', 'pms-muted', `count: ${group.assets.length}`));
      info.appendChild(createElement('div', 'pms-ids', `asset ids: ${group.ids.join(', ')}`));

      const button = createElement('button', 'pms-button pms-select-button', 'Select');
      button.type = 'button';
      button.addEventListener('click', () => {
        state.selectedGroupName = group.name;
        state.selectedSourceId = group.ids[0] || '';
        log(`選択グループ: ${group.name}`);
        selectAssetInEditor(findAssetInGroup(group, state.selectedSourceId), 'Group select');
        renderGroups();
        renderSelectedGroup();
        attachAutoSyncWatchers();
      });

      row.appendChild(info);
      row.appendChild(button);
      ui.groups.appendChild(row);
    });
  }

  function renderSelectedGroup() {
    if (!ui.selected) return;
    ui.selected.textContent = '';

    const group = findGroupByName(state.selectedGroupName);
    if (!group) {
      ui.selected.appendChild(createElement('div', 'pms-empty', 'グループ未選択'));
      return;
    }

    const grid = createElement('div', 'pms-selected-grid');

    grid.appendChild(createElement('label', '', 'name'));
    grid.appendChild(createElement('div', '', group.name));

    grid.appendChild(createElement('label', '', 'count'));
    grid.appendChild(createElement('div', '', String(group.assets.length)));

    grid.appendChild(createElement('label', '', 'source'));
    const select = createElement('select');
    group.assets.forEach((asset) => {
      const option = createElement('option');
      const id = getAssetId(asset);
      option.value = id;
      option.textContent = `id=${id}`;
      select.appendChild(option);
    });
    select.value = state.selectedSourceId || group.ids[0] || '';
    select.addEventListener('change', () => {
      state.selectedSourceId = select.value;
      log(`基準マテリアル: asset id=${state.selectedSourceId}`);
      selectAssetInEditor(findAssetInGroup(group, state.selectedSourceId), 'Source select');
      attachAutoSyncWatchers();
    });
    grid.appendChild(select);

    grid.appendChild(createElement('label', '', 'backup'));
    grid.appendChild(createElement('div', 'pms-muted', state.lastBackup ? `last: ${state.lastBackup.groupName}` : 'none'));

    ui.selected.appendChild(grid);
  }

  function setCollapsed(collapsed) {
    state.collapsed = collapsed;
    ui.root.classList.toggle('is-collapsed', collapsed);
    ui.toggle.textContent = collapsed ? '+' : '-';
    ui.toggle.title = collapsed ? 'Expand' : 'Collapse';
  }

  function clampPanelPosition(left, top) {
    if (!ui.root) return { left, top };
    const margin = 8;
    const rect = ui.root.getBoundingClientRect();
    const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);

    return {
      left: Math.min(Math.max(margin, left), maxLeft),
      top: Math.min(Math.max(margin, top), maxTop)
    };
  }

  function applyPanelPosition(left, top, persist) {
    if (!ui.root) return;
    const position = clampPanelPosition(left, top);
    ui.root.style.left = `${position.left}px`;
    ui.root.style.top = `${position.top}px`;
    ui.root.style.right = 'auto';

    if (persist) {
      try {
        window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(position));
      } catch (error) {
        log(`パネル位置の保存に失敗しました: ${error.message}`, 'warn');
      }
    }
  }

  function restorePanelPosition() {
    if (!ui.root) return;
    try {
      const raw = window.localStorage.getItem(POSITION_STORAGE_KEY);
      if (!raw) return;
      const position = JSON.parse(raw);
      if (typeof position.left === 'number' && typeof position.top === 'number') {
        applyPanelPosition(position.left, position.top, false);
      }
    } catch (error) {
      log(`保存済みパネル位置の読み込みに失敗しました: ${error.message}`, 'warn');
    }
  }

  function attachPanelDrag(header) {
    if (!header || !ui.root) return;

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, input, select, textarea, label, a')) return;

      const rect = ui.root.getBoundingClientRect();
      state.drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: rect.left,
        startTop: rect.top
      };

      ui.root.classList.add('is-dragging');
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    header.addEventListener('pointermove', (event) => {
      if (!state.drag || state.drag.pointerId !== event.pointerId) return;
      const nextLeft = state.drag.startLeft + event.clientX - state.drag.startX;
      const nextTop = state.drag.startTop + event.clientY - state.drag.startY;
      applyPanelPosition(nextLeft, nextTop, false);
    });

    function finishDrag(event) {
      if (!state.drag || state.drag.pointerId !== event.pointerId) return;
      const rect = ui.root.getBoundingClientRect();
      state.drag = null;
      ui.root.classList.remove('is-dragging');
      try {
        header.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Pointer capture may already be released by the browser.
      }
      applyPanelPosition(rect.left, rect.top, true);
    }

    header.addEventListener('pointerup', finishDrag);
    header.addEventListener('pointercancel', finishDrag);

    window.addEventListener('resize', () => {
      if (!ui.root) return;
      const rect = ui.root.getBoundingClientRect();
      applyPanelPosition(rect.left, rect.top, true);
    });
  }

  function buildUi() {
    if (ctx.root.getElementById(SCRIPT_ID)) return;

    const style = document.createElement('style');
    style.textContent = STYLE_TEXT;
    ctx.root.appendChild(style);

    ui.root = createElement('div');
    ui.root.id = SCRIPT_ID;

    const header = createElement('div', 'pms-header');
    header.appendChild(createElement('div', 'pms-title', 'Material Sync'));
    const headerActions = createElement('div', 'pms-header-actions');
    ui.status = createElement('div', 'pms-pill', 'idle');
    ui.toggle = createElement('button', 'pms-toggle', '-');
    ui.toggle.type = 'button';
    ui.toggle.addEventListener('click', () => setCollapsed(!state.collapsed));
    headerActions.appendChild(ui.status);
    headerActions.appendChild(ui.toggle);
    header.appendChild(headerActions);
    // Dragging belongs to the toolkit shell.

    const body = createElement('div', 'pms-body');

    const searchRow = createElement('div', 'pms-row');
    ui.search = createElement('input', 'pms-search');
    ui.search.type = 'search';
    ui.search.placeholder = 'Search material name';
    ui.search.addEventListener('input', () => {
      state.searchText = ui.search.value;
      renderGroups();
    });
    const scanButton = createElement('button', 'pms-button', 'Scan');
    scanButton.type = 'button';
    scanButton.addEventListener('click', scanMaterials);
    searchRow.appendChild(ui.search);
    searchRow.appendChild(scanButton);
    body.appendChild(searchRow);

    const actionRow = createElement('div', 'pms-row pms-row-wrap');
    const syncButton = createElement('button', 'pms-button pms-button-primary', 'Sync Now');
    syncButton.type = 'button';
    syncButton.addEventListener('click', () => syncSelectedGroup('Sync'));
    const undoButton = createElement('button', 'pms-button pms-button-danger', 'Undo Last Sync');
    undoButton.type = 'button';
    undoButton.addEventListener('click', restoreBackup);
    const clearButton = createElement('button', 'pms-button', 'Clear Log');
    clearButton.type = 'button';
    clearButton.addEventListener('click', () => {
      ui.log.textContent = '';
      log('ログをクリアしました');
    });
    actionRow.appendChild(syncButton);
    actionRow.appendChild(undoButton);
    actionRow.appendChild(clearButton);
    body.appendChild(actionRow);

    const checksRow = createElement('div', 'pms-row pms-row-wrap');
    const autoLabel = createElement('label', 'pms-check');
    ui.autoSync = createElement('input');
    ui.autoSync.type = 'checkbox';
    ui.autoSync.addEventListener('change', () => {
      state.autoSyncEnabled = ui.autoSync.checked;
      log(`Auto Sync: ${state.autoSyncEnabled ? 'ON' : 'OFF'}`);
      attachAutoSyncWatchers();
    });
    autoLabel.appendChild(ui.autoSync);
    autoLabel.appendChild(document.createTextNode('Auto Sync'));

    const textureLabel = createElement('label', 'pms-check');
    ui.copyTextures = createElement('input');
    ui.copyTextures.type = 'checkbox';
    ui.copyTextures.checked = state.copyTextureReferences;
    ui.copyTextures.addEventListener('change', () => {
      state.copyTextureReferences = ui.copyTextures.checked;
      log(`Copy texture references: ${state.copyTextureReferences ? 'ON' : 'OFF'}`);
    });
    textureLabel.appendChild(ui.copyTextures);
    textureLabel.appendChild(document.createTextNode('Copy texture references'));

    checksRow.appendChild(autoLabel);
    checksRow.appendChild(textureLabel);
    body.appendChild(checksRow);

    const selectedSection = createElement('div', 'pms-section');
    selectedSection.appendChild(createElement('div', 'pms-section-title', 'Selected Group'));
    ui.selected = createElement('div');
    selectedSection.appendChild(ui.selected);
    body.appendChild(selectedSection);

    const groupsSection = createElement('div', 'pms-section');
    groupsSection.appendChild(createElement('div', 'pms-section-title', 'Same-name Materials'));
    ui.groups = createElement('div', 'pms-groups');
    groupsSection.appendChild(ui.groups);
    body.appendChild(groupsSection);

    const logSection = createElement('div', 'pms-section');
    logSection.appendChild(createElement('div', 'pms-section-title', 'Log'));
    ui.log = createElement('div', 'pms-log');
    logSection.appendChild(ui.log);
    body.appendChild(logSection);

    ui.root.appendChild(header);
    ui.root.appendChild(body);
    ctx.container.appendChild(ui.root);
    // Position belongs to the toolkit shell.

    renderGroups();
    renderSelectedGroup();
    log('Material Sync パネルを初期化しました');
  }

  function startInitialScanRetries() {
    const delays = [0, 800, 2000, 5000];
    delays.forEach((delay, index) => {
      window.setTimeout(() => {
        if (!visible || state.scanCompleted) return;
        if (index > 0) log(`Editor API 初期化待ちリトライ ${index}/${delays.length - 1}`);
        scanMaterials();
      }, delay);
    });
  }

  function init() {
    try {
      buildUi();
      startEditorSelectionSync();
      startInitialScanRetries();
    } catch (error) {
      console.error('[Material Sync] 初期化に失敗しました', error);
    }
  }


  function writable() {
    if (!ctx.isCurrentContext()) { log('ページを再読み込みしてください。', 'warn'); return false; }
    const editor = getEditorObject();
    if (callEditor(editor, 'permissions:write') === true) return true;
    log('書き込み権限を確認できません。', 'warn');
    return false;
  }
  function stopBackgroundSync() {
    state.autoSyncEnabled = false;
    state.pendingAutoSync = false;
    if (ui.autoSync) ui.autoSync.checked = false;
    clearAutoSyncTimer();
    clearVerifyTimers();
    detachSourceWatchers();
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = 0;
  }
  ctx.hooks.isBusy = () => state.isSyncing;
  ctx.hooks.onHide = () => {
    visible = false;
    stopBackgroundSync();
    detachEditorSelectionWatchers();
    if (state.editorSelectionPollTimer) window.clearInterval(state.editorSelectionPollTimer);
    state.editorSelectionPollTimer = 0;
    log('ツールを閉じたためAuto Syncを停止しました。');
  };
  ctx.hooks.onShow = () => { visible = true; scanMaterials(); };
  init();

 }
});


Toolkit.register({
    id: 'parameter-sync',
    title: 'フォルダ間 パラメーター同期',
    description: '同名Materialの設定を同期し、参照素材を同期先フォルダへ移動します。',
    mount(ctx) {
    'use strict';

    /*
     * Editor v2.36.0 で確認した内部依存
     * assets-fs.ts / asset-panel.ts: assets:fs:move に Asset.observer を渡す。
     * assets-panel.ts: layout.assets.assets は一覧の読み込み後に設定される。
     * assets-sync.ts / realtime/asset.ts: Observer の変更を送信し、保存状態を確認する。
     * inspector/assets/material.ts / cubemap-face.ts: cubeMap と textures は実際の参照。
     * https://github.com/playcanvas/editor/tree/v2.36.0/src/editor
     * https://github.com/playcanvas/editor/tree/v2.36.0/src/editor-api
     */

    const EDIT_FIELDS = ['data', 'preload', 'tags'];
    const TIMEOUT = 20000;
    const ROOT_ID = 'material-parameter-sync-root';
    const fail = (message) => { throw new Error(message); };
    const messageOf = (error) => error?.message || String(error);
    const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
    const assetId = (value) => {
        const number = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
        return Number.isSafeInteger(number) && number > 0 ? number : null;
    };

    function signature(value) {
        return JSON.stringify(value, (_key, item) => isObject(item)
            ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
            : item);
    }

    const equal = (a, b) => signature(a) === signature(b);
    const label = (item) => item.name + ' (#' + item.id + ')';
    const byId = (a, b) => a.id - b.id;
    const settings = (asset) => Object.fromEntries(EDIT_FIELDS
        .filter((key) => asset.has(key))
        .map((key) => [key, structuredClone(asset.get(key))]));

    function environment() {
        if (!ctx.isCurrentContext()) fail('Editorの読み込みを待つか、ページを再読み込みしてください。');
        const editor = window.editor;
        const required = ['layout.assets', 'permissions:write', 'assets:fs:move',
            'assets:list', 'assets:isModule', 'realtime:send', 'realtime:assets:op'];
        const schema = editor?.schema?.assets;
        const realtime = editor?.realtime;
        if (typeof editor?.invoke !== 'function' ||
            required.some((name) => !editor.methods?.has?.(name)) ||
            typeof editor.assets?.get !== 'function' || typeof editor.assets?.list !== 'function' ||
            !Array.isArray(editor.selection?.items) || typeof schema?.getFieldsOfType !== 'function' ||
            typeof realtime?.assets?.get !== 'function' || typeof realtime?.on !== 'function') {
            fail('必要なEditor APIを利用できません。PlayCanvas Editorを開き、読み込み後に再試行してください。');
        }
        if (!realtime.connection?.connected || !realtime.connection?.authenticated) {
            fail('Editorがサーバーに接続されていません。再接続を待ってください。');
        }
        if (!editor.invoke('layout.assets')?.assets) {
            fail('Assetsパネルの読み込みが完了していません。');
        }
        const branch = editor.api?.globals?.branchId;
        if (!branch) fail('編集中のブランチを確認できません。');
        return { editor, branch, assets: editor.assets, schema, realtime };
    }

    function requireWrite(context) {
        if (context.editor.invoke('permissions:write') !== true) {
            fail('このブランチに書き込み権限がありません。');
        }
    }

    function describe(asset) {
        const id = assetId(asset.get('id'));
        const uniqueId = assetId(asset.get('uniqueId'));
        const name = asset.get('name');
        const type = asset.get('type');
        const path = asset.get('path');
        if (!id || !uniqueId || typeof name !== 'string' || typeof type !== 'string' ||
            !Array.isArray(path) || path.some((part) => !assetId(part))) {
            fail('アセットの情報が不完全です (#' + (id ?? '?') + ')。');
        }
        return { id, uniqueId, name, type, path: path.map(assetId) };
    }

    function folder(context, pick) {
        if (pick.editor !== context.editor || pick.branch !== context.branch) {
            fail('編集中のブランチが変わりました。フォルダを指定し直してください。');
        }
        const asset = context.assets.get(pick.id);
        if (!asset || assetId(asset.get('uniqueId')) !== pick.uniqueId || asset.get('type') !== 'folder') {
            fail('指定したフォルダが見つかりません (#' + pick.id + ')。');
        }
        return describe(asset);
    }

    function folderPath(context, path) {
        return '/' + path.map((id) => context.assets.get(id)?.get('name') || '#' + id).join('/');
    }

    function* valuesAt(value, parts, index = 0) {
        if (index === parts.length) {
            yield value;
            return;
        }
        if (!Array.isArray(value) && !isObject(value)) return;
        const key = parts[index];
        if (key === '*') {
            for (const item of Object.values(value)) yield* valuesAt(item, parts, index + 1);
        } else if (Object.hasOwn(value, key)) {
            yield* valuesAt(value[key], parts, index + 1);
        }
    }

    function* references(asset, data, paths) {
        for (const path of paths) {
            for (const value of valuesAt({ data }, path.split('.'))) {
                for (const ref of Array.isArray(value) ? value : [value]) {
                    if (ref == null || ref === '' || ref === 0 || ref === '0') continue;
                    const id = assetId(ref);
                    if (!id) fail(label(asset) + ' の参照形式に対応していません (' + path + ')。');
                    yield { id, path };
                }
            }
        }
    }

    function referencePaths(context, type) {
        const paths = context.schema.getFieldsOfType(type, 'asset');
        if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || !path.startsWith('data.'))) {
            fail('Editorの参照スキーマを取得できません (' + type + ')。');
        }
        // 旧データや参照型注釈のない環境でも、Editorのピッカーが使うパスを補う。
        if (type === 'cubemap') return [...new Set([...paths, 'data.textures'])];
        if (!paths.includes('data.diffuseMap') || !paths.includes('data.normalMap')) {
            fail('Editorのマテリアル参照スキーマに対応していません。');
        }
        return [...new Set([...paths, 'data.cubeMap'])];
    }

    function buildPlan(context, sourcePick, targetPick, includeSubfolders) {
        if (!sourcePick || !targetPick) fail('基準フォルダと同期先フォルダを指定してください。');
        const source = folder(context, sourcePick);
        const target = folder(context, targetPick);
        if (source.id === target.id) fail('基準フォルダと同期先フォルダは別々に指定してください。');
        const materialPaths = referencePaths(context, 'material');
        const cubemapPaths = referencePaths(context, 'cubemap');
        const sourceGroups = new Map();
        const targets = [];
        const isSelectedFolder = (id) => id === source.id || id === target.id;
        for (const asset of context.assets.list()) {
            if (asset.get('type') !== 'material' || asset.get('source')) continue;
            const path = asset.get('path');
            // 入れ子の指定では、各マテリアルを最も近い指定フォルダに割り当てる。
            const side = includeSubfolders ? assetId(path?.findLast((id) => isSelectedFolder(assetId(id)))) : assetId(path?.at(-1));
            if (!isSelectedFolder(side)) continue;
            const item = describe(asset);
            if (side === target.id) {
                targets.push(item);
            } else {
                if (!sourceGroups.has(item.name)) sourceGroups.set(item.name, []);
                sourceGroups.get(item.name).push(item);
            }
        }

        const matches = [];
        const skipped = [];
        const sources = new Map();
        const materials = new Map();
        const cubemapReferences = new Map();
        const updatePaths = [source, target].map((item) => folderPath(context, [...item.path, item.id]));
        for (const item of targets.sort(byId)) {
            const candidates = sourceGroups.get(item.name);
            if (!candidates) {
                skipped.push(item);
                continue;
            }
            const candidateIds = candidates.map((entry) => entry.id).sort((a, b) => a - b);
            const baseId = candidateIds[0];
            if (!sources.has(baseId)) {
                const base = candidates.find((entry) => entry.id === baseId);
                const values = settings(context.assets.get(baseId));
                if (!isObject(values.data)) fail(label(base) + ' のマテリアル設定を取得できません。');
                sources.set(baseId, { ...base, values, alternatives: candidateIds.slice(1) });
            }
            const before = settings(context.assets.get(item.id));
            if (!isObject(before.data) && before.data != null) {
                fail(label(item) + ' のマテリアル設定の形式に対応していません。');
            }
            const unchanged = equal(before, sources.get(baseId).values);
            matches.push({ ...item, baseId, before, unchanged });
        }

        function collect(owner, data, paths) {
            for (const { id, path } of references(owner, data, paths)) {
                if (materials.has(id)) continue;
                const ref = context.assets.get(id);
                if (!ref) fail(label(owner) + ' の参照先 #' + id + ' が見つかりません (' + path + ')。');
                const item = describe(ref);
                if (item.type === 'folder' || item.type === 'material') {
                    fail(label(owner) + ' の参照先は移動対象にできません (' + path + ' → ' + label(item) + ')。');
                }
                materials.set(id, { ...item, from: folderPath(context, item.path) });
                if (item.type === 'cubemap') {
                    const data = ref.get('data');
                    cubemapReferences.set(item.id, [...references(item, data, cubemapPaths)]);
                    collect(item, data, cubemapPaths);
                }
            }
        }

        for (const base of sources.values()) collect(base, base.values.data, materialPaths);
        const moves = [...materials.values()].filter((item) => item.path.at(-1) !== target.id).sort(byId);
        return { source, target, updatePaths, includeSubfolders, sources: [...sources.values()].sort(byId),
            matches, materials: [...materials.values()].sort(byId), moves, skipped,
            cubemapReferences: [...cubemapReferences].sort(([a], [b]) => a - b) };
    }

    function liveAsset(context, item) {
        const asset = context.assets.get(item.id);
        if (!asset || !equal(describe(asset), {
            id: item.id, uniqueId: item.uniqueId, name: item.name, type: item.type, path: item.path
        })) fail(label(item) + ' の名前・種類・所属フォルダ、またはアセットの実体が変わりました。');
        return asset;
    }

    function documentFor(context, item) {
        const document = context.realtime.assets.get(item.uniqueId);
        if (!document || typeof document.loaded !== 'boolean' ||
            typeof document.whenNothingPending !== 'function' || typeof document.on !== 'function') {
            fail(label(item) + ' の保存状態を確認するEditor APIを利用できません。');
        }
        if (!document.loaded || !isObject(document.data)) {
            fail(label(item) + ' のサーバーデータを読み込めていません。');
        }
        return document;
    }

    function editTarget(context, item) {
        const asset = liveAsset(context, item);
        const document = documentFor(context, item);
        if (typeof asset.set !== 'function' || typeof asset.unset !== 'function' ||
            asset.observer?.sync?.enabled !== true) {
            fail(label(item) + ' の編集を保存するEditor APIを利用できません。');
        }
        return { asset, document };
    }

    function waitForOperation(context, item, doc, start, confirmed, timeoutMessage) {
        return new Promise((resolve, reject) => {
            const handles = [];
            let timer;
            let poll;
            let done = false;
            const finish = (error) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                clearInterval(poll);
                for (const handle of handles) handle.unbind();
                if (error) reject(error);
                else resolve();
            };
            const check = () => {
                if (done) return;
                try {
                    if (confirmed()) finish();
                } catch (error) {
                    finish(error);
                }
            };

            try {
                handles.push(context.realtime.on('disconnect', () => finish(new Error('サーバーとの接続が切れました。'))));
                handles.push(context.realtime.on('error:asset', (error, uniqueId) => {
                    if (assetId(uniqueId) === item.uniqueId) {
                        finish(new Error('Editorがアセット操作を拒否しました。' + messageOf(error)));
                    }
                }));
                handles.push(doc.on('unload', () => finish(new Error('アセットのサーバーデータが切断されました。'))));
                timer = setTimeout(() => finish(new Error(timeoutMessage)), TIMEOUT);
                poll = setInterval(check, 100);
                start(check);
            } catch (error) {
                finish(error);
            }
        });
    }

    async function updateMaterial(context, item, base) {
        const { asset, document } = editTarget(context, item);
        if (!equal(settings(liveAsset(context, base)), base.values) ||
            !equal(settings(asset), item.before)) {
            fail('マテリアル設定が変わりました。プレビューを取り直してください。');
        }
        const fields = EDIT_FIELDS.filter((key) => !equal(item.before[key], base.values[key]));
        let drained = false;
        const matchesDocument = () => fields.every((key) => equal(document.data?.[key], base.values[key]));
        await waitForOperation(context, item, document, (check) => {
            for (const key of fields) {
                if (Object.hasOwn(base.values, key)) asset.set(key, structuredClone(base.values[key]));
                else asset.unset(key);
            }
            if (!equal(settings(asset), base.values)) fail('Editor上の設定が基準と一致しません。');
            document.whenNothingPending(() => {
                setTimeout(() => {
                    drained = true;
                    check();
                }, 0);
            });
        }, () => drained && matchesDocument() && equal(settings(asset), base.values),
        'マテリアルの保存を20秒以内に確認できませんでした。');
    }

    function moveAsset(context, item, target) {
        const asset = liveAsset(context, item);
        const destination = liveAsset(context, target);
        const document = documentFor(context, item);
        const expectedPath = [...target.path, target.id];
        const normalizePath = (path) => Array.isArray(path) ? path.map(assetId) : null;
        return waitForOperation(context, item, document, (check) => {
            const error = context.editor.invoke('assets:fs:move', [asset.observer], destination.observer);
            if (error) fail('Editorが素材の移動を拒否しました。' + messageOf(error));
            check();
        }, () => equal(normalizePath(asset.get('path')), expectedPath) &&
            equal(normalizePath(document.data?.path), expectedPath),
        '素材の移動を20秒以内に確認できませんでした。');
    }

    const host = document.createElement('div');
    host.id = ROOT_ID;
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' +
        ':host{display:block;color:#f3f5f6;font:13px/1.55 system-ui,sans-serif}' +
        'section{padding:10px 12px;background:#23282e;border-radius:8px}' +
        'button{font:inherit;color:inherit;background:#343e48;border:1px solid #667482;border-radius:4px;padding:4px 8px;cursor:pointer}' +
        'button:disabled{opacity:.5;cursor:default}button[data-run]{background:#006b59;border-color:#48a393}' +
        'p{margin:6px 0;overflow-wrap:anywhere}.folder{display:grid;gap:3px;margin:8px 0}.folder button{justify-self:start}' +
        '.actions{display:flex;gap:8px;margin:10px 0}.error{color:#ffadad}h3{font-size:13px;margin:9px 0 3px}' +
        'ul{padding-left:1.4em;margin:2px 0}li{overflow-wrap:anywhere}' +
        '</style><section>' +
        '<div class="folder"><button type="button" data-pick="source">基準フォルダに設定</button><span data-folder="source">未指定</span></div>' +
        '<div class="folder"><button type="button" data-pick="target">同期先フォルダに設定</button><span data-folder="target">未指定</span></div>' +
        '<label><input type="checkbox" data-subfolders> サブフォルダを含める</label>' +
        '<div class="actions"><button type="button" data-preview>プレビュー</button>' +
        '<button type="button" data-run disabled>同期を実行</button></div>' +
        '<p role="status">Assetsパネルでフォルダを1つずつ選択して指定してください。</p><div data-report></div></section>';
    ctx.container.append(host);

    const status = root.querySelector('[role=status]');
    const report = root.querySelector('[data-report]');
    const previewButton = root.querySelector('[data-preview]');
    const subfolders = root.querySelector('[data-subfolders]');
    subfolders.checked = true;
    const run = root.querySelector('[data-run]');
    const picks = { source: null, target: null };
    let preview = null;
    let busy = false;
    ctx.hooks.isBusy = () => busy;

    function statusText(text, error = false) {
        status.textContent = text;
        status.classList.toggle('error', error);
    }

    function list(title, entries) {
        const heading = document.createElement('h3');
        heading.textContent = title + '（' + entries.length + '件）';
        report.append(heading);
        if (!entries.length) return;
        const ul = document.createElement('ul');
        for (const text of entries) {
            const li = document.createElement('li');
            li.textContent = text;
            ul.append(li);
        }
        report.append(ul);
    }

    function clearPreview() {
        preview = null;
        run.disabled = true;
        report.replaceChildren();
    }

    for (const button of root.querySelectorAll('[data-pick]')) {
        button.addEventListener('click', () => {
            if (busy) return;
            clearPreview();
            const role = button.dataset.pick;
            const other = role === 'source' ? 'target' : 'source';
            const output = root.querySelector('[data-folder=' + role + ']');
            picks[role] = null;
            output.textContent = '未指定';
            try {
                const context = environment();
                const selected = context.editor.selection.items;
                const asset = selected[0];
                if (selected.length !== 1 || asset?.get?.('type') !== 'folder') {
                    fail('Assetsパネルでフォルダを1つだけ選択してください。');
                }
                const item = describe(asset);
                if (context.assets.get(item.id) !== asset) fail('有効なアセットフォルダを選択してください。');
                if (picks[other]?.uniqueId === item.uniqueId) fail('すでに指定済みのフォルダです。別のフォルダを選択してください。');
                picks[role] = { editor: context.editor, branch: context.branch, id: item.id, uniqueId: item.uniqueId };
                output.textContent = folderPath(context, [...item.path, item.id]) + ' (#' + item.id + ')';
                statusText(picks[other] ? 'プレビューで変更内容を確認してください。' : 'もう一方のフォルダを指定してください。');
            } catch (error) {
                statusText(messageOf(error), true);
            }
        });
    }

    subfolders.addEventListener('change', () => {
        if (busy) return;
        clearPreview();
        statusText(subfolders.checked
            ? '基準と同期先のサブフォルダを含めます。プレビューで確認してください。'
            : '基準と同期先の直下を対象にします。プレビューで確認してください。');
    });

    previewButton.addEventListener('click', () => {
        if (busy) return;
        clearPreview();
        try {
            const context = environment();
            const plan = buildPlan(context, picks.source, picks.target, subfolders.checked);
            const bases = new Map(plan.sources.map((base) => [base.id, base]));
            const scope = document.createElement('p');
            scope.textContent = plan.includeSubfolders ? '検索範囲：両フォルダとその配下' : '検索範囲：両フォルダの直下';
            if (plan.includeSubfolders && (plan.source.path.includes(plan.target.id) || plan.target.path.includes(plan.source.id))) {
                scope.textContent += '。範囲が重なる場合は、各マテリアルを最も近い指定フォルダに割り当てます。';
            }
            report.append(scope);
            for (const [index, role] of ['source', 'target'].entries()) {
                root.querySelector('[data-folder=' + role + ']').textContent =
                    plan.updatePaths[index] + ' (#' + plan[role].id + ')';
            }
            list('同名マテリアル', plan.matches.map((item) => {
                const base = bases.get(item.baseId);
                return label(item) + ' ← 基準 #' + base.id +
                    (base.alternatives.length ? '（ほかの候補 ' + base.alternatives.map((id) => '#' + id).join('、') + '）' : '') +
                    (item.unchanged ? '［設定は一致済み］' : '［設定を更新］') +
                    (plan.includeSubfolders ? '　' + folderPath(context, item.path) + ' ← ' + folderPath(context, base.path) : '');
            }));
            list('同期先に移動する素材', plan.moves.map((item) => label(item) + ' [' + item.type + ']　元 ' + item.from));
            list('スキップ（基準に同名なし）', plan.skipped.map((item) =>
                label(item) + (plan.includeSubfolders ? '　' + folderPath(context, item.path) : '')));
            const hasWork = plan.moves.length || plan.matches.some((item) => !item.unchanged);
            statusText(hasWork
                ? '実行するとマテリアルの設定（プリロード・タグを含む）を揃え、一覧の素材の所属フォルダを変更します。'
                : '変更対象はありません。');
            preview = plan;
            run.disabled = !hasWork;
        } catch (error) {
            statusText(messageOf(error), true);
        }
    });

    run.addEventListener('click', async () => {
        if (!preview || busy || run.disabled) return;
        const reviewed = preview;
        const updated = [];
        const moved = [];
        const actions = reviewed.matches.filter((item) => !item.unchanged).map((item) => ({ item, kind: '更新' }))
            .concat(reviewed.moves.map((item) => ({ item, kind: '移動' })));
        let index = 0;
        let attempted = false;
        let failure = '';
        busy = true;
        run.disabled = true;
        for (const button of root.querySelectorAll('[data-pick], [data-preview], [data-subfolders]')) button.disabled = true;

        try {
            const context = environment();
            requireWrite(context);
            const plan = buildPlan(context, picks.source, picks.target, subfolders.checked);
            if (!equal(reviewed, plan)) fail('プレビュー後に内容が変わりました。プレビューを取り直してください。');
            const bases = new Map(plan.sources.map((base) => [base.id, base]));
            for (const { item, kind } of actions) {
                if (kind === '更新') editTarget(context, item);
                else {
                    const asset = liveAsset(context, item);
                    if (!asset.observer || !context.assets.get(plan.target.id)?.observer) {
                        fail('素材の移動に必要なEditor APIを利用できません。');
                    }
                    documentFor(context, item);
                }
            }
            for (; index < actions.length; index++) {
                attempted = false;
                const { item, kind } = actions[index];
                const current = environment();
                if (current.editor !== context.editor || current.branch !== context.branch) {
                    fail('編集中のブランチが変わりました。');
                }
                requireWrite(context);
                liveAsset(context, plan.source);
                liveAsset(context, plan.target);
                if (kind === '移動' && (index === 0 || actions[index - 1].kind === '更新')) {
                    for (const base of plan.sources) {
                        if (!equal(settings(liveAsset(context, base)), base.values)) {
                            fail('基準の設定が変わりました。素材の移動には新しいプレビューが必要です。');
                        }
                    }
                    const paths = referencePaths(context, 'cubemap');
                    for (const [id, refs] of plan.cubemapReferences) {
                        const item = plan.materials.find((entry) => entry.id === id);
                        const data = liveAsset(context, item).get('data');
                        if (!equal([...references(item, data, paths)], refs)) {
                            fail(label(item) + ' の参照が変わりました。素材の移動には新しいプレビューが必要です。');
                        }
                    }
                }
                const done = index + 1;
                statusText(kind + 'を処理中（' + done + '/' + actions.length + '） ' + label(item));
                attempted = true;
                if (kind === '更新') {
                    await updateMaterial(context, item, bases.get(item.baseId));
                    updated.push(label(item));
                } else {
                    await moveAsset(context, item, plan.target);
                    moved.push(label(item));
                }
            }
        } catch (error) {
            failure = messageOf(error);
        } finally {
            clearPreview();
            list('更新済み', updated);
            list('移動済み', moved);
            if (failure && attempted && actions[index]) {
                const { item, kind } = actions[index];
                list('完了を確認できなかった項目', [kind + ' ' + label(item) + '。Editorで現在の状態を確認してください。']);
            }
            if (failure) {
                list('未処理', actions.slice(index + (attempted ? 1 : 0)).map(({ item, kind }) => kind + ' ' + label(item)));
            }
            list('設定は一致済み', reviewed.matches.filter((item) => item.unchanged).map(label));
            list('スキップ（基準に同名なし）', reviewed.skipped.map(label));
            statusText(failure ? '処理を中止しました。' + failure : '同期が完了しました。', Boolean(failure));
            busy = false;
            for (const button of root.querySelectorAll('[data-pick], [data-preview], [data-subfolders]')) button.disabled = false;
        }
    });
    }
});


// Adapted from PlayCanvas Maya Select 1.2.0. Panel lifecycle belongs to Toolkit.
Toolkit.register({
 id: 'maya-select',
 title: 'Maya 選択',
 description: 'MELのselect文や名前リストからEntity / Materialを一括選択します。',
 shortcut: 'm',
 mount(ctx) {

    'use strict';

    // 詳細ログと、コンソール用デバッグAPIを有効にします。
    const DEBUG = true;

    const PREFIX = '[Maya Select]';
    const HOST_ID = 'pc-maya-select-host';
    let active = false;
    const DEBUG_API_KEY = 'pcMayaSelectDebug';

    const STORAGE_KEYS = Object.freeze({
        settings: 'pc-maya-select-settings-v1',
        position: 'pc-maya-select-position-v1',
        minimized: 'pc-maya-select-minimized-v1'
    });
    const DEFAULT_SETTINGS = Object.freeze({
        targetType: 'auto',
        materialFolderId: 'all',
        includeSubfolders: true,
        caseSensitive: true,
        stripNamespace: true,
        stripShape: true,
        selectAllDuplicates: true
    });

    const log = {
        info(...args) {
            console.info(PREFIX, ...args);
        },
        debug(...args) {
            if (DEBUG) {
                console.debug(PREFIX, ...args);
            }
        },
        warn(...args) {
            console.warn(PREFIX, ...args);
        },
        error(...args) {
            console.error(PREFIX, ...args);
        }
    };

    /**
     * MELのselect文、引用符、コメント、通常の名前リストを安全に字句解析します。
     * eval / new Function は使用しません。
     */
    class MayaMelParser {
        parse(source) {
            const input = typeof source === 'string' ? source : '';
            const tokens = [];
            const warnings = [];
            let token = '';
            let quote = null;
            let escaped = false;
            let inLineComment = false;
            let inBlockComment = false;

            const pushToken = () => {
                const value = token.trim();
                if (value) {
                    tokens.push(value);
                }
                token = '';
            };

            for (let index = 0; index < input.length; index += 1) {
                const character = input[index];
                const next = input[index + 1];

                if (inLineComment) {
                    if (character === '\n' || character === '\r') {
                        inLineComment = false;
                    }
                    continue;
                }

                if (inBlockComment) {
                    if (character === '*' && next === '/') {
                        inBlockComment = false;
                        index += 1;
                    }
                    continue;
                }

                if (quote) {
                    if (escaped) {
                        // 一般のバックスラッシュは保持し、引用符とバックスラッシュだけを解除します。
                        token += character === quote || character === '\\' ? character : `\\${character}`;
                        escaped = false;
                    } else if (character === '\\') {
                        escaped = true;
                    } else if (character === quote) {
                        quote = null;
                    } else {
                        token += character;
                    }
                    continue;
                }

                if (character === '/' && next === '/') {
                    pushToken();
                    inLineComment = true;
                    index += 1;
                    continue;
                }

                if (character === '/' && next === '*') {
                    pushToken();
                    inBlockComment = true;
                    index += 1;
                    continue;
                }

                if (character === '"' || character === "'") {
                    quote = character;
                    continue;
                }

                if (
                    /\s/.test(character) ||
                    [',', ';', '，', '；', '、', '「', '」'].includes(character)
                ) {
                    pushToken();
                    continue;
                }

                token += character;
            }

            if (escaped) {
                token += '\\';
            }
            pushToken();

            if (quote) {
                warnings.push('引用符が閉じていません。閉じる前までを名前として解析しました。');
            }
            if (inBlockComment) {
                warnings.push('ブロックコメントが閉じていません。');
            }

            const excluded = new Set(['select', '-r', '-add', '-tgl']);
            const names = tokens.filter((value) => {
                const lower = value.toLocaleLowerCase();
                // 未知のselectフラグもEntity名として扱わないようにします。
                return value && !excluded.has(lower) && !value.startsWith('-');
            });

            return { names, tokens, warnings };
        }
    }

    /** Maya名の変換候補を作り、入力ごとに最初に一致した候補だけを採用します。 */
    class EntityMatcher {
        constructor(settings) {
            this.settings = settings;
        }

        getItemName(item) {
            try {
                if (item && typeof item.get === 'function') {
                    const value = item.get('name');
                    if (typeof value === 'string') {
                        return value;
                    }
                }
                if (item && typeof item.name === 'string') {
                    return item.name;
                }
                if (item && item.observer && typeof item.observer.get === 'function') {
                    return item.observer.get('name') || '';
                }
                if (item && item.__pcMayaName) {
                    return item.__pcMayaName;
                }
            } catch (error) {
                log.debug('項目名の取得に失敗しました。', error, item);
            }
            return '';
        }

        getLeafName(mayaName) {
            const parts = String(mayaName)
                .split('|')
                .filter((part) => part.length > 0);
            return parts.length ? parts[parts.length - 1] : String(mayaName).replace(/^\|+|\|+$/g, '');
        }

        stripNamespace(name) {
            const parts = name.split(':');
            return parts.length > 1 ? parts[parts.length - 1] : name;
        }

        stripShapeSuffix(name) {
            const expression = this.settings.caseSensitive ? /Shape$/ : /Shape$/i;
            return name.replace(expression, '');
        }

        createCandidates(mayaName) {
            const candidates = [];
            const add = (name, reason) => {
                if (!name) {
                    return;
                }
                const key = this.settings.caseSensitive ? name : name.toLocaleLowerCase();
                if (!candidates.some((candidate) => candidate.key === key)) {
                    candidates.push({ name, key, reason });
                }
            };

            // 階層パスは最後のDAGノード名を完全一致候補として扱います。
            const leafName = this.getLeafName(mayaName);
            add(leafName, '完全一致');

            const namespaceFree = this.settings.stripNamespace ? this.stripNamespace(leafName) : leafName;
            if (this.settings.stripNamespace) {
                add(namespaceFree, 'namespace除外');
            }

            if (this.settings.stripShape) {
                add(this.stripShapeSuffix(leafName), 'Shape除外');
                if (this.settings.stripNamespace) {
                    add(this.stripShapeSuffix(namespaceFree), 'namespace・Shape除外');
                }
            }

            return candidates;
        }

        normalize(value) {
            return this.settings.caseSensitive ? value : value.toLocaleLowerCase();
        }

        match(inputNames, entities) {
            const selectedEntities = [];
            const selectedSet = new Set();
            const notFound = [];
            const duplicateMatches = [];
            const details = [];
            const nameIndex = new Map();

            // 一覧を入力名ごとに走査せず、名前索引を1回だけ作って検索を軽量化します。
            for (const entity of entities) {
                const entityName = this.getItemName(entity);
                if (!entityName) {
                    continue;
                }
                const key = this.normalize(entityName);
                const indexed = nameIndex.get(key);
                if (indexed) {
                    indexed.push(entity);
                } else {
                    nameIndex.set(key, [entity]);
                }
            }

            for (const inputName of inputNames) {
                const candidates = this.createCandidates(inputName);
                let winningCandidate = null;
                let matches = [];

                for (const candidate of candidates) {
                    matches = nameIndex.get(candidate.key) || [];
                    if (matches.length) {
                        winningCandidate = candidate;
                        break;
                    }
                }

                if (!winningCandidate) {
                    notFound.push(inputName);
                    details.push({ input: inputName, candidates, matches: [] });
                    continue;
                }

                if (matches.length > 1) {
                    duplicateMatches.push({
                        input: inputName,
                        query: winningCandidate.name,
                        count: matches.length,
                        selectedCount: this.settings.selectAllDuplicates ? matches.length : 1
                    });
                }

                const chosen = this.settings.selectAllDuplicates ? matches : matches.slice(0, 1);
                for (const entity of chosen) {
                    if (!selectedSet.has(entity)) {
                        selectedSet.add(entity);
                        selectedEntities.push(entity);
                    }
                }

                details.push({
                    input: inputName,
                    candidates,
                    winningCandidate,
                    matches,
                    chosen
                });
            }

            return { selectedEntities, notFound, duplicateMatches, details };
        }
    }

    class PlayCanvasEditorAdapter {
        constructor(editorObject) {
            this.editor = editorObject;
            this.lastEntitySource = null;
            this.lastAssetSource = null;
            this.lastSelectionSource = null;
            this.entityCache = null;
            this.assetCache = null;
            this.folderCache = null;
        }

        invalidateEntities() {
            this.entityCache = null;
        }

        invalidateAssets() {
            this.assetCache = null;
            this.folderCache = null;
        }

        isAvailable() {
            const editorObject = this.editor;
            return Boolean(
                editorObject &&
                    (typeof editorObject.call === 'function' ||
                        typeof editorObject.entities?.list === 'function' ||
                        typeof editorObject.api?.globals?.entities?.list === 'function' ||
                        typeof editorObject.assets?.list === 'function' ||
                        typeof editorObject.api?.globals?.assets?.list === 'function')
            );
        }

        hasMethod(name) {
            const methods = this.editor?.methods;
            return methods instanceof Map ? methods.has(name) : false;
        }

        safeCall(name, ...args) {
            if (!this.editor || typeof this.editor.call !== 'function') {
                return null;
            }
            return this.editor.call(name, ...args);
        }

        getAllEntities() {
            if (!this.isAvailable()) {
                throw new Error('PlayCanvasのeditorオブジェクトまたはEditor APIを取得できません。');
            }
            if (this.entityCache) {
                return this.entityCache;
            }

            const attempts = [];
            const publicEntities = this.editor.entities || this.editor.api?.globals?.entities;
            if (publicEntities && typeof publicEntities.list === 'function') {
                try {
                    const entities = publicEntities.list();
                    if (Array.isArray(entities)) {
                        this.lastEntitySource = 'editor.entities.list()';
                        this.entityCache = entities;
                        return this.entityCache;
                    }
                } catch (error) {
                    attempts.push({ api: 'editor.entities.list()', error });
                }
            }

            // 旧Editor APIとの互換経路です。Observer配列が返ります。
            if (typeof this.editor.call === 'function') {
                try {
                    const entities = this.safeCall('entities:list');
                    if (Array.isArray(entities)) {
                        this.lastEntitySource = "editor.call('entities:list')";
                        this.entityCache = entities;
                        return this.entityCache;
                    }
                } catch (error) {
                    attempts.push({ api: "editor.call('entities:list')", error });
                }
            }

            // API名変更時はHierarchyが保持するObserverList / TreeItemを調べます。
            try {
                const hierarchy = this.safeCall('entities:hierarchy');
                const rawEntities = hierarchy?._entities;
                if (rawEntities && typeof rawEntities.array === 'function') {
                    const entities = rawEntities.array();
                    if (Array.isArray(entities)) {
                        this.lastEntitySource = 'Hierarchy ObserverList';
                        this.entityCache = entities;
                        return this.entityCache;
                    }
                }

                if (hierarchy?._treeItemIndex instanceof Map) {
                    const entities = Array.from(hierarchy._treeItemIndex.values())
                        .map((item) => item?.entity)
                        .filter(Boolean);
                    if (entities.length) {
                        this.lastEntitySource = 'Hierarchy TreeItem index';
                        this.entityCache = entities;
                        return this.entityCache;
                    }
                }
            } catch (error) {
                attempts.push({ api: 'Hierarchy data', error });
            }

            const domEntities = this.getEntitiesFromDom();
            if (domEntities.length) {
                this.lastEntitySource = 'Hierarchy DOM（表示中の項目のみ）';
                return domEntities;
            }

            log.debug('Entity取得APIの試行結果', attempts);
            throw new Error(
                'Entity一覧を取得できません。シーン未読込、またはPlayCanvas Editor APIの変更が考えられます。'
            );
        }

        getAllAssets() {
            if (!this.isAvailable()) {
                throw new Error('PlayCanvasのeditorオブジェクトまたはAsset APIを取得できません。');
            }
            if (this.assetCache) {
                return this.assetCache;
            }

            const attempts = [];
            const publicAssets = this.editor.assets || this.editor.api?.globals?.assets;
            if (publicAssets && typeof publicAssets.list === 'function') {
                try {
                    const assets = publicAssets.list();
                    if (Array.isArray(assets)) {
                        this.lastAssetSource = 'editor.assets.list()';
                        this.assetCache = assets;
                        return this.assetCache;
                    }
                } catch (error) {
                    attempts.push({ api: 'editor.assets.list()', error });
                }
            }

            // 旧Editor APIではAsset Observer配列が返ります。
            if (typeof this.editor.call === 'function') {
                try {
                    const assets = this.safeCall('assets:list');
                    if (Array.isArray(assets)) {
                        this.lastAssetSource = "editor.call('assets:list')";
                        this.assetCache = assets;
                        return this.assetCache;
                    }
                } catch (error) {
                    attempts.push({ api: "editor.call('assets:list')", error });
                }
            }

            try {
                const rawAssets = this.safeCall('assets:raw');
                if (rawAssets && typeof rawAssets.array === 'function') {
                    const assets = rawAssets.array();
                    if (Array.isArray(assets)) {
                        this.lastAssetSource = 'Asset ObserverList';
                        this.assetCache = assets;
                        return this.assetCache;
                    }
                }

                const assetPanel = this.safeCall('layout.assets');
                if (assetPanel?._assets && typeof assetPanel._assets.array === 'function') {
                    const assets = assetPanel._assets.array();
                    if (Array.isArray(assets)) {
                        this.lastAssetSource = 'Asset Panel ObserverList';
                        this.assetCache = assets;
                        return this.assetCache;
                    }
                }
            } catch (error) {
                attempts.push({ api: 'Asset panel data', error });
            }

            const domAssets = this.getAssetsFromDom();
            if (domAssets.length) {
                this.lastAssetSource = 'Assets DOM（表示中の項目のみ）';
                return domAssets;
            }

            log.debug('Asset取得APIの試行結果', attempts);
            throw new Error(
                'Asset一覧を取得できません。Asset未読込、またはPlayCanvas Editor APIの変更が考えられます。'
            );
        }

        getAllMaterialAssets(folderId = 'all', includeSubfolders = true) {
            const selectedFolderId = String(folderId ?? 'all');
            return this.getAllAssets().filter((asset) => {
                if (this.getItemValue(asset, 'type') !== 'material') {
                    return false;
                }
                if (selectedFolderId === 'all') {
                    return true;
                }
                const path = this.getItemValue(asset, 'path');
                const folderPath = Array.isArray(path) ? path.map(String) : [];
                if (selectedFolderId === 'root') {
                    return folderPath.length === 0;
                }
                return includeSubfolders
                    ? folderPath.includes(selectedFolderId)
                    : folderPath.at(-1) === selectedFolderId;
            });
        }

        getAssetFolders() {
            if (this.folderCache) {
                return this.folderCache;
            }
            const folders = this.getAllAssets().filter((asset) => this.getItemValue(asset, 'type') === 'folder');
            const byId = new Map(folders.map((folder) => [String(this.getAssetId(folder)), folder]));
            this.folderCache = folders
                .map((folder) => {
                    const id = String(this.getAssetId(folder));
                    const path = this.getItemValue(folder, 'path');
                    const names = (Array.isArray(path) ? path : [])
                        .map((parentId) => byId.get(String(parentId)))
                        .filter(Boolean)
                        .map((parent) => String(this.getItemValue(parent, 'name') || ''))
                        .filter(Boolean);
                    names.push(String(this.getItemValue(folder, 'name') || id));
                    return { id, label: `/${names.join('/')}` };
                })
                .filter((folder) => folder.id && folder.id !== 'undefined' && folder.id !== 'null')
                .sort((a, b) => a.label.localeCompare(b.label, 'ja'));
            return this.folderCache;
        }

        getItemValue(item, path) {
            try {
                if (item && typeof item.get === 'function') {
                    return item.get(path);
                }
                if (item?.observer && typeof item.observer.get === 'function') {
                    return item.observer.get(path);
                }
                return item?.[path];
            } catch (_error) {
                return undefined;
            }
        }

        getEntitiesFromDom() {
            const selectors = [
                '.entities-treeview .pcui-treeview-item',
                '.entities-treeview [data-entity-id]',
                '.entities-treeview [data-resource-id]'
            ];
            const elements = Array.from(document.querySelectorAll(selectors.join(',')));
            const seen = new Set();
            const result = [];

            for (const element of elements) {
                const treeItem = element.ui || element.__ui || null;
                if (treeItem?.entity && !seen.has(treeItem.entity)) {
                    seen.add(treeItem.entity);
                    result.push(treeItem.entity);
                    continue;
                }

                const label =
                    element.getAttribute('aria-label') ||
                    element.dataset?.name ||
                    element.querySelector('.pcui-treeview-item-text, .pcui-label')?.textContent ||
                    '';
                const name = label.trim();
                if (!name) {
                    continue;
                }
                const id = element.dataset?.entityId || element.dataset?.resourceId || `dom-${result.length}`;
                const key = `${id}:${name}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                result.push({
                    __pcMayaName: name,
                    __pcMayaId: id,
                    __pcMayaDomElement: element,
                    get(path) {
                        return path === 'name' ? name : path === 'resource_id' ? id : undefined;
                    }
                });
            }
            return result;
        }

        getAssetsFromDom() {
            const selectors = [
                '.pcui-asset-panel .pcui-gridview-item',
                '.pcui-asset-panel [data-asset-id]',
                '.assets-panel [data-id]'
            ];
            const elements = Array.from(document.querySelectorAll(selectors.join(',')));
            const seen = new Set();
            const result = [];

            for (const element of elements) {
                const asset = element.ui?.asset || element.__ui?.asset || null;
                if (asset && !seen.has(asset)) {
                    seen.add(asset);
                    result.push(asset);
                    continue;
                }

                const label =
                    element.getAttribute('aria-label') ||
                    element.dataset?.name ||
                    element.querySelector('.pcui-label, [class*="name"]')?.textContent ||
                    '';
                const name = label.trim();
                const type = element.dataset?.type || (element.classList.contains('type-material') ? 'material' : '');
                if (!name || !type) {
                    continue;
                }
                const id = element.dataset?.assetId || element.dataset?.id || `dom-asset-${result.length}`;
                const key = `${id}:${name}:${type}`;
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                result.push({
                    __pcMayaName: name,
                    __pcMayaId: id,
                    __pcMayaType: type,
                    __pcMayaDomElement: element,
                    get(path) {
                        return path === 'name' ? name : path === 'id' ? id : path === 'type' ? type : undefined;
                    }
                });
            }
            return result;
        }

        toApiEntity(entity) {
            if (!entity) {
                return null;
            }
            if (entity.apiEntity) {
                return entity.apiEntity;
            }
            if (entity.observer?.apiEntity) {
                return entity.observer.apiEntity;
            }
            if (entity._observer?.apiEntity) {
                return entity._observer.apiEntity;
            }
            // 現行の公開Entityはobserver getterを持ちます。
            if (typeof entity.get === 'function' && entity.observer) {
                return entity;
            }
            return null;
        }

        toApiAsset(asset) {
            if (!asset) {
                return null;
            }
            if (asset.apiAsset) {
                return asset.apiAsset;
            }
            if (asset.observer?.apiAsset) {
                return asset.observer.apiAsset;
            }
            if (asset._observer?.apiAsset) {
                return asset._observer.apiAsset;
            }
            // 現行の公開Assetはobserver getterを持ちます。
            if (typeof asset.get === 'function' && asset.observer) {
                return asset;
            }
            return null;
        }

        toObserver(entity) {
            if (!entity) {
                return null;
            }
            if (entity.apiEntity) {
                return entity;
            }
            if (entity.observer) {
                return entity.observer;
            }
            if (entity._observer) {
                return entity._observer;
            }
            return null;
        }

        selectEntities(entities) {
            if (!this.isAvailable()) {
                throw new Error('PlayCanvas Editor APIが利用できません。');
            }

            const publicSelection = this.editor.selection || this.editor.api?.globals?.selection;
            const apiEntities = entities.map((entity) => this.toApiEntity(entity));
            if (publicSelection && typeof publicSelection.set === 'function' && apiEntities.every(Boolean)) {
                publicSelection.set(apiEntities);
                this.lastSelectionSource = 'editor.selection.set()';
                return;
            }

            const observers = entities.map((entity) => this.toObserver(entity));
            if (
                typeof this.editor.call === 'function' &&
                observers.every(Boolean) &&
                (this.hasMethod('selector:set') || !(this.editor.methods instanceof Map))
            ) {
                this.safeCall('selector:set', 'entity', observers);
                this.lastSelectionSource = "editor.call('selector:set', 'entity', observers)";
                return;
            }

            // 公開/旧選択APIがない場合も、PCUI TreeViewの選択イベント経由で正式状態への反映を試みます。
            const hierarchy = this.safeCall('entities:hierarchy');
            if (hierarchy && typeof hierarchy.getTreeItemForEntity === 'function') {
                const items = entities
                    .map((entity) => hierarchy.getTreeItemForEntity(this.getEntityId(entity)))
                    .filter(Boolean);
                if (items.length === entities.length) {
                    if (typeof hierarchy.deselect === 'function') {
                        hierarchy.deselect();
                    }
                    items.forEach((item) => {
                        item.selected = true;
                    });
                    this.lastSelectionSource = 'Hierarchy TreeView selection events';
                    return;
                }
            }

            const domElements = entities.map((entity) => entity?.__pcMayaDomElement);
            if (domElements.every(Boolean)) {
                domElements.forEach((element, index) => {
                    element.dispatchEvent(
                        new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            ctrlKey: index > 0,
                            metaKey: false
                        })
                    );
                });
                this.lastSelectionSource = 'Hierarchy DOM click events（最終フォールバック）';
                return;
            }

            throw new Error(
                '複数Entityを正式な選択状態にするAPIが見つかりません。Entity情報確認のログを参照してください。'
            );
        }

        selectAssets(assets) {
            if (!this.isAvailable()) {
                throw new Error('PlayCanvas Asset APIが利用できません。');
            }

            const publicSelection = this.editor.selection || this.editor.api?.globals?.selection;
            const apiAssets = assets.map((asset) => this.toApiAsset(asset));
            if (publicSelection && typeof publicSelection.set === 'function' && apiAssets.every(Boolean)) {
                publicSelection.set(apiAssets);
                this.lastSelectionSource = 'editor.selection.set(materialAssets)';
                return;
            }

            const observers = assets.map((asset) => this.toObserver(asset));
            if (
                typeof this.editor.call === 'function' &&
                observers.every(Boolean) &&
                (this.hasMethod('selector:set') || !(this.editor.methods instanceof Map))
            ) {
                this.safeCall('selector:set', 'asset', observers);
                this.lastSelectionSource = "editor.call('selector:set', 'asset', observers)";
                return;
            }

            const assetPanel = this.safeCall('layout.assets');
            if (assetPanel && 'selectedAssets' in assetPanel && observers.every(Boolean)) {
                assetPanel.selectedAssets = observers;
                this.lastSelectionSource = 'Asset Panel selection events';
                return;
            }

            const domElements = assets.map((asset) => asset?.__pcMayaDomElement);
            if (domElements.every(Boolean)) {
                domElements.forEach((element, index) => {
                    element.dispatchEvent(
                        new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            ctrlKey: index > 0,
                            metaKey: false
                        })
                    );
                });
                this.lastSelectionSource = 'Assets DOM click events（最終フォールバック）';
                return;
            }

            throw new Error(
                '複数Material Assetを正式な選択状態にするAPIが見つかりません。情報確認ログを参照してください。'
            );
        }

        getEntityId(entity) {
            try {
                if (entity && typeof entity.get === 'function') {
                    return entity.get('resource_id');
                }
                if (entity?.observer && typeof entity.observer.get === 'function') {
                    return entity.observer.get('resource_id');
                }
                return entity?.__pcMayaId || null;
            } catch (_error) {
                return null;
            }
        }

        getAssetId(asset) {
            return this.getItemValue(asset, 'id') ?? asset?.__pcMayaId ?? null;
        }

        focusEntity(entity) {
            if (!entity) {
                return false;
            }
            const id = this.getEntityId(entity);
            let item = null;

            try {
                item = id ? this.safeCall('entities:panel:get', id) : null;
                if (!item) {
                    const hierarchy = this.safeCall('entities:hierarchy');
                    item = hierarchy?.getTreeItemForEntity?.(id) || null;
                }

                if (item) {
                    // 折りたたまれた親を開いて、最後の選択Entityを見える状態にします。
                    let parent = item.parent;
                    while (parent) {
                        if ('open' in parent && parent.entity) {
                            parent.open = true;
                        }
                        parent = parent.parent;
                    }

                    const scrollElement = item.content?.dom || item.dom;
                    if (scrollElement && typeof scrollElement.scrollIntoView === 'function') {
                        requestAnimationFrame(() => {
                            scrollElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                        });
                        return true;
                    }
                }

                const domElement = entity.__pcMayaDomElement;
                if (domElement && typeof domElement.scrollIntoView === 'function') {
                    domElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    return true;
                }
            } catch (error) {
                log.debug('Hierarchyのフォーカスに失敗しました。', error);
            }
            return false;
        }

        focusAsset(asset) {
            if (!asset) {
                return false;
            }
            const id = this.getAssetId(asset);
            try {
                const assetPanel = this.safeCall('layout.assets');
                const item = assetPanel?._rowsIndex?.[id] || assetPanel?._gridIndex?.[id];
                if (item && !item.hidden && typeof item.focus === 'function') {
                    item.focus();
                    return true;
                }
                if (assetPanel && typeof assetPanel._focusAssetItem === 'function') {
                    assetPanel._focusAssetItem(id);
                    return true;
                }

                const domElement = asset.__pcMayaDomElement;
                if (domElement && typeof domElement.scrollIntoView === 'function') {
                    domElement.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                    return true;
                }
            } catch (error) {
                log.debug('Assetsパネルのフォーカスに失敗しました。', error);
            }
            return false;
        }

        getCurrentSelection() {
            const publicSelection = this.editor?.selection || this.editor?.api?.globals?.selection;
            if (publicSelection && Array.isArray(publicSelection.items)) {
                return publicSelection.items;
            }
            const items = this.safeCall('selector:items');
            return Array.isArray(items) ? items : [];
        }

        getCurrentSelectionType() {
            const type = this.safeCall('selector:type');
            if (type) {
                return type;
            }
            const first = this.getCurrentSelection()[0];
            if (!first) {
                return null;
            }
            return first.apiAsset || first.observer?.apiAsset ? 'asset' : 'entity';
        }

        getDiagnostics() {
            const methodNames = this.editor?.methods instanceof Map ? Array.from(this.editor.methods.keys()) : [];
            const likelyMethods = methodNames
                .map(String)
                .filter((name) => /entit|asset|select|hierarch|scene/i.test(name))
                .sort();
            return {
                windowEditor: Boolean(window.editor),
                editorCall: typeof this.editor?.call === 'function',
                publicEntitiesList: typeof this.editor?.entities?.list === 'function',
                globalsEntitiesList: typeof this.editor?.api?.globals?.entities?.list === 'function',
                publicAssetsList: typeof this.editor?.assets?.list === 'function',
                globalsAssetsList: typeof this.editor?.api?.globals?.assets?.list === 'function',
                publicSelectionSet: typeof this.editor?.selection?.set === 'function',
                globalsSelectionSet: typeof this.editor?.api?.globals?.selection?.set === 'function',
                legacyEntitiesList: this.hasMethod('entities:list'),
                legacyAssetsList: this.hasMethod('assets:list'),
                legacySelectorSet: this.hasMethod('selector:set'),
                hierarchyApi: this.hasMethod('entities:hierarchy'),
                hierarchyPanelItemApi: this.hasMethod('entities:panel:get'),
                assetPanelApi: this.hasMethod('layout.assets'),
                likelyMethods
            };
        }
    }

    class StorageService {
        loadJson(key, fallback) {
            try {
                const stored = localStorage.getItem(key);
                return stored ? { ...fallback, ...JSON.parse(stored) } : { ...fallback };
            } catch (error) {
                log.warn('localStorageの読み込みに失敗しました。', key, error);
                return { ...fallback };
            }
        }

        saveJson(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (error) {
                log.warn('localStorageへの保存に失敗しました。', key, error);
            }
        }

        loadBoolean(key, fallback) {
            try {
                const value = localStorage.getItem(key);
                return value === null ? fallback : value === 'true';
            } catch (_error) {
                return fallback;
            }
        }

        saveBoolean(key, value) {
            try {
                localStorage.setItem(key, String(Boolean(value)));
            } catch (error) {
                log.warn('localStorageへの保存に失敗しました。', key, error);
            }
        }
    }

    class MayaSelectPanel {
        constructor({ settings, position, minimized, callbacks }) {
            this.settings = settings;
            this.position = position;
            this.minimized = minimized;
            this.callbacks = callbacks;
            this.visible = true;
            this.dragState = null;
            this.refs = {};
            this.create();
        }

        createElement(tagName, className, text) {
            const element = document.createElement(tagName);
            if (className) {
                element.className = className;
            }
            if (text !== undefined) {
                element.textContent = text;
            }
            return element;
        }

        create() {
            const existing = ctx.container.querySelector(`#${HOST_ID}`);
            if (existing) {
                existing.remove();
            }

            const host = document.createElement('div');
            host.id = HOST_ID;
            host.style.position = 'static';
            host.style.zIndex = '2147483000';
            host.style.right = '16px';
            host.style.bottom = '16px';
            host.style.pointerEvents = 'auto';
            const shadow = host.attachShadow({ mode: 'open' });

            const style = document.createElement('style');
            style.textContent = `
                :host { all: initial; color-scheme: dark; }
                .pc-maya-select-panel {
                    width: 326px;
                    max-width: calc(100vw - 24px);
                    box-sizing: border-box;
                    overflow: hidden;
                    border: 1px solid #4b5057;
                    border-radius: 7px;
                    background: #24272c;
                    color: #e7e9ec;
                    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.46);
                    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                }
                .pc-maya-select-header {
                    display: flex;
                    align-items: center;
                    min-height: 34px;
                    padding: 0 7px 0 11px;
                    border-bottom: 1px solid #3e434a;
                    background: #30343a;
                    cursor: move;
                    user-select: none;
                    touch-action: none;
                }
                .pc-maya-select-title { flex: 1; color: #f5f6f7; font-weight: 650; letter-spacing: .2px; }
                .pc-maya-select-minimize {
                    width: 27px;
                    height: 25px;
                    padding: 0;
                    border: 0;
                    border-radius: 4px;
                    background: transparent;
                    color: #cbd0d6;
                    cursor: pointer;
                    font: 18px/1 sans-serif;
                }
                .pc-maya-select-minimize:hover { background: #454a51; color: #fff; }
                .pc-maya-select-body { padding: 10px; }
                .pc-maya-select-body[hidden] { display: none; }
                .pc-maya-select-label { display: block; margin: 0 0 5px; color: #cdd1d6; }
                .pc-maya-select-textarea {
                    display: block;
                    width: 100%;
                    min-height: 96px;
                    max-height: 230px;
                    box-sizing: border-box;
                    resize: vertical;
                    padding: 8px;
                    border: 1px solid #515760;
                    border-radius: 4px;
                    outline: none;
                    background: #17191d;
                    color: #f0f1f3;
                    font: 12px/1.45 Consolas, "SFMono-Regular", monospace;
                }
                .pc-maya-select-textarea:focus { border-color: #48a9f8; box-shadow: 0 0 0 1px #48a9f8; }
                .pc-maya-select-target { display: grid; grid-template-columns: 74px minmax(0, 1fr); align-items: center; gap: 8px; margin-top: 9px; color: #d7dadf; }
                .pc-maya-select-target[hidden] { display: none; }
                .pc-maya-select-select {
                    min-width: 0;
                    height: 29px;
                    box-sizing: border-box;
                    padding: 3px 7px;
                    border: 1px solid #515760;
                    border-radius: 4px;
                    outline: none;
                    background: #17191d;
                    color: #eef0f2;
                    font: inherit;
                }
                .pc-maya-select-select:focus { border-color: #48a9f8; box-shadow: 0 0 0 1px #48a9f8; }
                .pc-maya-select-select:disabled, .pc-maya-select-checkbox:disabled { opacity: .48; cursor: not-allowed; }
                .pc-maya-select-options { display: grid; gap: 5px; margin: 9px 0; }
                .pc-maya-select-option { display: flex; align-items: center; gap: 7px; color: #d7dadf; cursor: pointer; user-select: none; }
                .pc-maya-select-checkbox { margin: 0; accent-color: #269be8; }
                .pc-maya-select-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
                .pc-maya-select-button {
                    min-height: 30px;
                    padding: 5px 8px;
                    border: 1px solid #555c65;
                    border-radius: 4px;
                    background: #3a3f46;
                    color: #eef0f2;
                    cursor: pointer;
                    font: inherit;
                }
                .pc-maya-select-button:hover { background: #474d55; }
                .pc-maya-select-button:active { transform: translateY(1px); }
                .pc-maya-select-button--primary {
                    border-color: #168ad2;
                    background: #148fd8;
                    color: #fff;
                    font-weight: 650;
                }
                .pc-maya-select-button--primary:hover { background: #24a1ea; }
                .pc-maya-select-button--wide { grid-column: 1 / -1; }
                .pc-maya-select-status {
                    min-height: 51px;
                    max-height: 156px;
                    overflow: auto;
                    box-sizing: border-box;
                    margin-top: 9px;
                    padding: 7px 8px;
                    border-left: 3px solid #727983;
                    border-radius: 3px;
                    background: #1b1e22;
                    color: #cfd3d8;
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                    user-select: text;
                }
                .pc-maya-select-status--success { border-left-color: #42b879; color: #aee5c8; }
                .pc-maya-select-status--warning { border-left-color: #e4ac42; color: #f0cf8d; }
                .pc-maya-select-status--error { border-left-color: #e45d68; color: #f2a0a7; }
                .pc-maya-select-status--loading { border-left-color: #4ba8e8; color: #a9d6f5; }
                .pc-maya-select-hint { margin-top: 6px; color: #8f969e; font-size: 11px; text-align: right; }
            `;

            const panel = this.createElement('section', 'pc-maya-select-panel');
            panel.setAttribute('aria-label', 'Maya Select');
            const header = this.createElement('header', 'pc-maya-select-header');
            const title = this.createElement('span', 'pc-maya-select-title', 'Maya Select');
            const minimize = this.createElement('button', 'pc-maya-select-minimize', this.minimized ? '+' : '−');
            minimize.type = 'button';
            minimize.title = 'パネルを最小化';
            minimize.setAttribute('aria-label', 'パネルを最小化');
            header.append(title, minimize);

            const body = this.createElement('div', 'pc-maya-select-body');
            body.hidden = this.minimized;
            const inputLabel = this.createElement('label', 'pc-maya-select-label', 'MELコマンド / オブジェクト・マテリアル名');
            const textarea = this.createElement('textarea', 'pc-maya-select-textarea');
            textarea.rows = 5;
            textarea.placeholder = 'select -r Body SeatFabric;';
            textarea.spellcheck = false;
            inputLabel.append(textarea);

            const targetLabel = this.createElement('label', 'pc-maya-select-target', '検索対象');
            const targetSelect = this.createElement('select', 'pc-maya-select-select');
            const targetDefinitions = [
                ['auto', '自動判定（多く一致する方）'],
                ['entity', 'Entity'],
                ['material', 'Material Asset']
            ];
            for (const [value, text] of targetDefinitions) {
                const option = this.createElement('option', 'pc-maya-select-option-item', text);
                option.value = value;
                targetSelect.append(option);
            }
            targetSelect.value = targetDefinitions.some(([value]) => value === this.settings.targetType)
                ? this.settings.targetType
                : 'auto';
            targetLabel.append(targetSelect);

            const folderLabel = this.createElement('label', 'pc-maya-select-target', '検索フォルダ');
            const folderSelect = this.createElement('select', 'pc-maya-select-select');
            folderSelect.title = 'Material Assetを検索するフォルダ';
            folderLabel.append(folderSelect);

            const options = this.createElement('div', 'pc-maya-select-options');
            const optionDefinitions = [
                ['includeSubfolders', '選択フォルダのサブフォルダを含む'],
                ['caseSensitive', '大文字・小文字を区別する'],
                ['stripNamespace', 'namespaceを除外して検索する'],
                ['stripShape', '末尾のShapeを除外して再検索する'],
                ['selectAllDuplicates', '同名候補をすべて選択']
            ];
            for (const [key, labelText] of optionDefinitions) {
                const label = this.createElement('label', 'pc-maya-select-option');
                const checkbox = this.createElement('input', 'pc-maya-select-checkbox');
                checkbox.type = 'checkbox';
                checkbox.checked = Boolean(this.settings[key]);
                checkbox.dataset.setting = key;
                const text = document.createTextNode(labelText);
                label.append(checkbox, text);
                options.append(label);
                this.refs[key] = checkbox;
            }

            const buttons = this.createElement('div', 'pc-maya-select-buttons');
            const selectButton = this.createElement(
                'button',
                'pc-maya-select-button pc-maya-select-button--primary',
                '選択'
            );
            selectButton.type = 'button';
            const clearButton = this.createElement('button', 'pc-maya-select-button', '入力をクリア');
            clearButton.type = 'button';
            const inspectButton = this.createElement(
                'button',
                'pc-maya-select-button pc-maya-select-button--wide',
                'Entity / Material情報を確認'
            );
            inspectButton.type = 'button';
            buttons.append(selectButton, clearButton, inspectButton);

            const status = this.createElement('div', 'pc-maya-select-status pc-maya-select-status--loading');
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            status.textContent = 'PlayCanvas Editorの読み込みを待っています…';
            const hint = this.createElement('div', 'pc-maya-select-hint', 'Ctrl+Enter：実行 / Ctrl+Shift+M：表示切替');

            body.append(inputLabel, targetLabel, folderLabel, options, buttons, status, hint);
            panel.append(header, body);
            shadow.append(style, panel);
            ctx.container.append(host);
            const embeddedStyle = document.createElement('style');
            embeddedStyle.textContent = ':host{display:block;width:100%}.pc-maya-select-panel{width:100%;max-width:none;border:0;box-shadow:none}.pc-maya-select-header{display:none}.pc-maya-select-body{max-height:none}';
            shadow.append(embeddedStyle);

            this.host = host;
            this.shadow = shadow;
            this.refs.header = header;
            this.refs.body = body;
            this.refs.minimize = minimize;
            this.refs.textarea = textarea;
            this.refs.targetType = targetSelect;
            this.refs.folderLabel = folderLabel;
            this.refs.materialFolderId = folderSelect;
            this.refs.selectButton = selectButton;
            this.refs.clearButton = clearButton;
            this.refs.inspectButton = inspectButton;
            this.refs.status = status;

            this.setFolderOptions([], false);
            this.updateFolderControls();
            this.bindEvents();

        }

        bindEvents() {
            this.refs.selectButton.addEventListener('click', () => this.callbacks.onSelect());
            this.refs.clearButton.addEventListener('click', () => {
                this.refs.textarea.value = '';
                this.setStatus('入力をクリアしました。', 'loading');
                this.refs.textarea.focus();
            });
            this.refs.inspectButton.addEventListener('click', () => this.callbacks.onInspect());


            this.refs.targetType.addEventListener('change', () => {
                this.settings.targetType = this.refs.targetType.value;
                this.updateFolderControls();
                this.callbacks.onSettingsChanged({ ...this.settings });
                this.callbacks.onFolderOptionsRequest();
            });

            this.refs.materialFolderId.addEventListener('change', () => {
                this.settings.materialFolderId = this.refs.materialFolderId.value;
                this.updateFolderControls();
                this.callbacks.onSettingsChanged({ ...this.settings });
                this.callbacks.onFolderChanged();
            });
            this.refs.materialFolderId.addEventListener('pointerdown', () => this.callbacks.onFolderOptionsRequest());
            this.refs.materialFolderId.addEventListener('focus', () => this.callbacks.onFolderOptionsRequest());

            for (const key of [
                'includeSubfolders',
                'caseSensitive',
                'stripNamespace',
                'stripShape',
                'selectAllDuplicates'
            ]) {
                this.refs[key].addEventListener('change', () => {
                    this.settings[key] = this.refs[key].checked;
                    this.callbacks.onSettingsChanged({ ...this.settings });
                    if (key === 'includeSubfolders') {
                        this.callbacks.onFolderChanged();
                    }
                });
            }

            // テキスト入力中のキーをEditor本体へ伝播させません。
            this.refs.textarea.addEventListener('keydown', (event) => {
                if (event.ctrlKey && !event.shiftKey && event.key === 'Enter') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.callbacks.onSelect();
                    return;
                }
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    this.refs.textarea.blur();
                    return;
                }
                event.stopPropagation();
            });
            this.refs.textarea.addEventListener('keyup', (event) => event.stopPropagation());
            this.refs.textarea.addEventListener('keypress', (event) => event.stopPropagation());

            // Shadow DOM外のPlayCanvas UIへマウス操作を漏らさないようにします。
            ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu', 'wheel'].forEach(
                (eventName) => this.shadow.addEventListener(eventName, (event) => event.stopPropagation())
            );


        }

        setFolderOptions(folders, authoritative = true) {
            const definitions = [
                ['all', 'すべてのフォルダ'],
                ['root', '/（ルート直下）'],
                ...folders.map((folder) => [folder.id, folder.label])
            ];
            const desired = String(this.settings.materialFolderId || 'all');
            if (!authoritative && !definitions.some(([value]) => value === desired)) {
                definitions.push([desired, '保存済みフォルダを読み込み中…']);
            }
            const signature = definitions.map(([value, label]) => `${value}:${label}`).join('\n');
            if (this.folderOptionsSignature !== signature) {
                const fragment = document.createDocumentFragment();
                for (const [value, label] of definitions) {
                    const option = this.createElement('option', 'pc-maya-select-option-item', label);
                    option.value = value;
                    fragment.append(option);
                }
                this.refs.materialFolderId.replaceChildren(fragment);
                this.folderOptionsSignature = signature;
            }

            const available = definitions.some(([value]) => value === desired);
            const selected = available ? desired : 'all';
            this.refs.materialFolderId.value = selected;
            if (!available && authoritative) {
                this.settings.materialFolderId = selected;
                this.callbacks.onSettingsChanged?.({ ...this.settings });
            }
            this.updateFolderControls();
            return selected;
        }

        updateFolderControls() {
            const enabled = this.settings.targetType !== 'entity';
            this.refs.materialFolderId.disabled = !enabled;
            this.refs.includeSubfolders.disabled = !enabled || this.settings.materialFolderId === 'all';
        }

        getFolderLabel() {
            return this.refs.materialFolderId.selectedOptions[0]?.textContent || 'すべてのフォルダ';
        }

        getInput() {
            return this.refs.textarea.value;
        }

        setStatus(message, type = 'loading') {
            const status = this.refs.status;
            status.className = `pc-maya-select-status pc-maya-select-status--${type}`;
            // 外部入力をHTMLとして挿入しないため、必ずtextContentを使います。
            status.textContent = String(message);
        }
    }

    class MayaSelectApplication {
        constructor() {
            this.parser = new MayaMelParser();
            this.storage = new StorageService();
            this.settings = this.storage.loadJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
            if (!['auto', 'entity', 'material'].includes(this.settings.targetType)) {
                this.settings.targetType = 'auto';
            }
            this.settings.materialFolderId = String(this.settings.materialFolderId || 'all');
            this.settings.includeSubfolders = this.settings.includeSubfolders !== false;
            this.position = {};
            this.minimized = false;
            this.panel = null;
            this.adapter = null;
            this.connecting = false;
            this.connectGeneration = 0;
            this.editorHandles = [];
            this.userHidden = false;
            this.mutationQueued = false;
            this.assetRefreshTimer = null;
        }

        start() {
            this.ensurePanel();
            this.installGlobalShortcuts();
        }

        isEditorLocation() {
            return /(^|\.)playcanvas\.com$/.test(location.hostname) && /^\/editor/.test(location.pathname);
        }

        installGlobalShortcuts() {
            window.addEventListener(
                'keydown',
                (event) => {
                    if (!active) return;
                    const textarea = this.panel?.refs?.textarea;
                    const isPanelTextarea = textarea && event.composedPath?.().includes(textarea);
                    if (isPanelTextarea) {
                        if (event.ctrlKey && !event.shiftKey && event.key === 'Enter') {
                            event.preventDefault();
                            this.executeSelection();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            textarea.blur();
                        }
                        // Editorがcaptureフェーズで監視している場合も入力キーを渡しません。
                        event.stopImmediatePropagation();
                    }
                },
                true
            );
        }

        async connectToEditor() {
            if (!active || this.connecting || !this.isEditorLocation()) {
                return;
            }
            this.connecting = true;
            const generation = ++this.connectGeneration;
            try {
                const editorObject = await this.waitForEditor(20000);
                if (!active || generation !== this.connectGeneration) {
                    return;
                }
                this.unbindEditorEvents();
                this.adapter = editorObject ? new PlayCanvasEditorAdapter(editorObject) : null;
                this.ensurePanel();
                if (!this.adapter?.isAvailable()) {
                    this.panel.setStatus(
                        'エラー：PlayCanvasのeditorオブジェクトを取得できません。ページ再読み込み後も続く場合は「Entity / Material情報を確認」を実行してください。',
                        'error'
                    );
                    return;
                }
                this.bindEditorEvents(editorObject);
                this.refreshFolderOptions();
                this.refreshEditorStatus();
            } catch (error) {
                this.ensurePanel();
                this.panel.setStatus(`エラー：Editor初期化待機中に失敗しました。\n${this.errorMessage(error)}`, 'error');
                log.error('Editor初期化エラー', error);
            } finally {
                this.connecting = false;
            }
        }

        waitForEditor(timeoutMilliseconds) {
            return new Promise((resolve) => {
                const startedAt = Date.now();
                let retryTimer = null;
                let settled = false;
                let editorLoadHandle = null;

                const finish = (value) => {
                    if (settled) {
                        return;
                    }
                    settled = true;
                    if (retryTimer) {
                        clearTimeout(retryTimer);
                    }
                    editorLoadHandle?.unbind?.();
                    resolve(value);
                };

                const check = () => {
                    if (settled) {
                        return;
                    }
                    const editorObject = window.editor;
                    if (editorObject && document.readyState !== 'loading') {
                        finish(editorObject);
                        return;
                    }

                    if (editorObject && document.readyState === 'loading' && !editorLoadHandle) {
                        try {
                            editorLoadHandle = editorObject.once?.('load', () => {
                                setTimeout(() => finish(editorObject), 0);
                            });
                        } catch (error) {
                            log.debug('editor loadイベント待機を利用できません。', error);
                        }
                    }

                    if (Date.now() - startedAt >= timeoutMilliseconds) {
                        finish(editorObject || null);
                        return;
                    }
                    retryTimer = setTimeout(check, Math.min(1000, 80 + (Date.now() - startedAt) / 10));
                };

                document.addEventListener('DOMContentLoaded', check, { once: true });
                check();
            });
        }

        ensurePanel() {
            if (this.panel?.host?.isConnected) {
                return;
            }
            if (!document.body) {
                document.addEventListener('DOMContentLoaded', () => this.ensurePanel(), { once: true });
                return;
            }
            this.panel = new MayaSelectPanel({
                settings: this.settings,
                position: this.position,
                minimized: this.minimized,
                callbacks: {
                    onSelect: () => this.executeSelection(),
                    onInspect: () => this.inspectEntities(),
                    onFolderOptionsRequest: () => this.refreshFolderOptions(),
                    onFolderChanged: () => this.refreshEditorStatus(),
                    onSettingsChanged: (settings) => {
                        this.settings = settings;
                        this.storage.saveJson(STORAGE_KEYS.settings, settings);
                    },
                    onMinimizedChanged: () => {}
                }
            });

        }

        bindEditorEvents(editorObject) {
            if (!editorObject || typeof editorObject.on !== 'function') {
                return;
            }
            const bind = (name, callback) => {
                try {
                    const handle = editorObject.on(name, callback);
                    if (handle) {
                        this.editorHandles.push(handle);
                    }
                } catch (error) {
                    log.debug(`Editorイベント ${name} を購読できません。`, error);
                }
            };
            bind('scene:beforeload', () => {
                this.adapter?.invalidateEntities();
                this.panel?.setStatus('シーンを読み込んでいます…', 'loading');
            });
            bind('entities:load', () => {
                this.adapter?.invalidateEntities();
                this.refreshEditorStatus();
            });
            bind('entities:add', () => this.adapter?.invalidateEntities());
            bind('entities:remove', () => this.adapter?.invalidateEntities());
            bind('entities:clear', () => this.adapter?.invalidateEntities());
            bind('assets:load', () => this.refreshAssetData());
            bind('assets:add', () => this.scheduleAssetRefresh());
            bind('assets:remove', () => this.scheduleAssetRefresh());
            bind('assets:move', () => this.scheduleAssetRefresh());
            bind('scene:unload', () => {
                this.adapter?.invalidateEntities();
                queueMicrotask(() => this.refreshEditorStatus());
            });
            bind('assets:clear', () => {
                this.adapter?.invalidateAssets();
                queueMicrotask(() => this.refreshAssetData());
            });
            bind('realtime:disconnected', () =>
                this.panel?.setStatus('PlayCanvasのリアルタイム接続が切断されました。', 'error')
            );
        }

        unbindEditorEvents() {
            if (this.assetRefreshTimer) {
                clearTimeout(this.assetRefreshTimer);
                this.assetRefreshTimer = null;
            }
            for (const handle of this.editorHandles) {
                try {
                    handle?.unbind?.();
                } catch (_error) {
                    // 古いEditorのイベントハンドル破棄失敗は無視して再接続を続行します。
                }
            }
            this.editorHandles = [];
        }

        scheduleAssetRefresh() {
            this.adapter?.invalidateAssets();
            if (this.assetRefreshTimer) {
                clearTimeout(this.assetRefreshTimer);
            }
            // 連続アップロード時のaddイベントをまとめ、一覧再構築を1回に抑えます。
            this.assetRefreshTimer = setTimeout(() => {
                this.assetRefreshTimer = null;
                this.refreshAssetData();
            }, 160);
        }

        refreshAssetData() {
            if (this.assetRefreshTimer) {
                clearTimeout(this.assetRefreshTimer);
                this.assetRefreshTimer = null;
            }
            this.adapter?.invalidateAssets();
            this.refreshFolderOptions();
            this.refreshEditorStatus();
        }

        refreshFolderOptions() {
            if (!this.panel || !this.adapter?.isAvailable()) {
                return;
            }
            try {
                this.panel.setFolderOptions(this.adapter.getAssetFolders());
            } catch (error) {
                log.debug('Assetフォルダ一覧を更新できませんでした。', error);
            }
        }

        getMaterialScope() {
            return {
                folderId: this.settings.materialFolderId || 'all',
                includeSubfolders: this.settings.includeSubfolders !== false
            };
        }

        getMaterialScopeText() {
            const scope = this.getMaterialScope();
            const suffix =
                scope.folderId !== 'all' && scope.includeSubfolders ? '（サブフォルダを含む）' : '';
            return `${this.panel?.getFolderLabel() || 'すべてのフォルダ'}${suffix}`;
        }

        refreshEditorStatus() {
            if (!this.panel || !this.adapter?.isAvailable()) {
                return;
            }
            let entityCount = null;
            let materialCount = null;
            const errors = [];
            try {
                entityCount = this.adapter.getAllEntities().length;
            } catch (error) {
                errors.push(`Entity: ${this.errorMessage(error)}`);
            }
            try {
                const scope = this.getMaterialScope();
                materialCount = this.adapter.getAllMaterialAssets(scope.folderId, scope.includeSubfolders).length;
            } catch (error) {
                errors.push(`Material Asset: ${this.errorMessage(error)}`);
            }

            if (entityCount === null && materialCount === null) {
                this.panel.setStatus(`エラー：${errors.join('\n')}`, 'error');
                log.error('Entity / Material一覧取得エラー', errors);
                return;
            }

            const entityText = entityCount === null ? '取得不可' : `${entityCount}件`;
            const materialText = materialCount === null ? '取得不可' : `${materialCount}件`;
            if ((entityCount || 0) > 0 || (materialCount || 0) > 0) {
                this.panel.setStatus(
                    `準備完了\nEntity：${entityText}\nMaterial Asset：${materialText}\n検索フォルダ：${this.getMaterialScopeText()}`,
                    'success'
                );
                log.debug('Editor接続完了', {
                    entityCount,
                    materialCount,
                    entitySource: this.adapter.lastEntitySource,
                    assetSource: this.adapter.lastAssetSource
                });
            } else {
                this.panel.setStatus('EntityまたはAssetの読み込みを待っています…', 'loading');
            }
        }

        executeSelection() {
            if (!active) return;
            try {
                if (!ctx.isCurrentContext()) throw new Error('プロジェクトが変わりました。ページを再読み込みしてください。');
                this.adapter?.invalidateEntities();
                this.adapter?.invalidateAssets();
                if (!this.panel) {
                    return;
                }
                const parsed = this.parser.parse(this.panel.getInput());
                if (!parsed.names.length) {
                    const warningText = parsed.warnings.length ? `\n解析警告：${parsed.warnings.join(' / ')}` : '';
                    this.panel.setStatus(`入力が空か、選択できるオブジェクト名がありません。${warningText}`, 'warning');
                    log.warn('選択対象名がありません。', parsed);
                    return;
                }
                if (!this.adapter?.isAvailable()) {
                    this.panel.setStatus('エラー：PlayCanvas Editor APIがまだ利用できません。', 'error');
                    this.connectToEditor();
                    return;
                }

                const matcher = new EntityMatcher(this.settings);
                const requestedTarget = this.settings.targetType;
                const materialScope = this.getMaterialScope();
                let entityMatched = null;
                let materialMatched = null;
                let entityError = null;
                let materialError = null;

                if (requestedTarget === 'auto' || requestedTarget === 'entity') {
                    try {
                        entityMatched = matcher.match(parsed.names, this.adapter.getAllEntities());
                    } catch (error) {
                        entityError = error;
                    }
                }
                if (requestedTarget === 'auto' || requestedTarget === 'material') {
                    try {
                        materialMatched = matcher.match(
                            parsed.names,
                            this.adapter.getAllMaterialAssets(
                                materialScope.folderId,
                                materialScope.includeSubfolders
                            )
                        );
                    } catch (error) {
                        materialError = error;
                    }
                }

                if (requestedTarget === 'entity' && !entityMatched) {
                    throw entityError || new Error('Entity一覧を取得できません。');
                }
                if (requestedTarget === 'material' && !materialMatched) {
                    throw materialError || new Error('Material Asset一覧を取得できません。');
                }
                if (requestedTarget === 'auto' && !entityMatched && !materialMatched) {
                    throw new Error(
                        `EntityとMaterial Assetの一覧を取得できません。${
                            [entityError, materialError]
                                .filter(Boolean)
                                .map((error) => this.errorMessage(error))
                                .join(' / ')
                        }`
                    );
                }

                const entityScore = entityMatched ? parsed.names.length - entityMatched.notFound.length : -1;
                const materialScore = materialMatched ? parsed.names.length - materialMatched.notFound.length : -1;
                let selectedTarget = requestedTarget;
                if (requestedTarget === 'auto') {
                    // 同点時は既存挙動を維持するためEntityを優先します。明示選択で切り替え可能です。
                    selectedTarget = materialScore > entityScore ? 'material' : 'entity';
                    if (!entityMatched) {
                        selectedTarget = 'material';
                    } else if (!materialMatched) {
                        selectedTarget = 'entity';
                    }
                }

                const matched = selectedTarget === 'material' ? materialMatched : entityMatched;
                const targetLabel = selectedTarget === 'material' ? 'Material Asset' : 'Entity';
                // select -r相当として、未検出のみの場合も現在の選択を解除します。
                if (selectedTarget === 'material') {
                    this.adapter.selectAssets(matched.selectedEntities);
                } else {
                    this.adapter.selectEntities(matched.selectedEntities);
                }
                if (matched.selectedEntities.length) {
                    const lastSelected = matched.selectedEntities[matched.selectedEntities.length - 1];
                    if (selectedTarget === 'material') {
                        this.adapter.focusAsset(lastSelected);
                    } else {
                        this.adapter.focusEntity(lastSelected);
                    }
                }

                const lines = [];
                if (requestedTarget === 'auto') {
                    const entityScoreText = entityScore < 0 ? '取得不可' : `${entityScore}件`;
                    const materialScoreText = materialScore < 0 ? '取得不可' : `${materialScore}件`;
                    lines.push(
                        `対象：自動 → ${targetLabel}（Entity一致${entityScoreText} / Material一致${materialScoreText}）`
                    );
                } else {
                    lines.push(`対象：${targetLabel}`);
                }
                if (selectedTarget === 'material') {
                    lines.push(`検索フォルダ：${this.getMaterialScopeText()}`);
                }
                lines.push(`入力：${parsed.names.length}件`, `選択：${matched.selectedEntities.length}件`);
                if (matched.notFound.length) {
                    lines.push(`未検出：${matched.notFound.join(', ')}`);
                }
                if (matched.duplicateMatches.length) {
                    const duplicateText = matched.duplicateMatches.map(
                        (entry) =>
                            `${entry.input}（候補${entry.count}件／選択${entry.selectedCount}件）`
                    );
                    lines.push(`重複一致：${duplicateText.join(', ')}`);
                }
                if (parsed.warnings.length) {
                    lines.push(`解析警告：${parsed.warnings.join(' / ')}`);
                }

                const statusType =
                    matched.selectedEntities.length === 0 || matched.notFound.length || parsed.warnings.length
                        ? 'warning'
                        : 'success';
                this.panel.setStatus(lines.join('\n'), statusType);

                log.info(lines.join(' / '));
                if (DEBUG) {
                    console.groupCollapsed(`${PREFIX} 選択詳細`);
                    console.debug(PREFIX, '解析結果', parsed);
                    console.debug(PREFIX, '検索結果', matched.details);
                    console.debug(PREFIX, '未検出', matched.notFound);
                    console.debug(PREFIX, '重複一致', matched.duplicateMatches);
                    console.debug(PREFIX, '選択対象', targetLabel);
                    console.debug(PREFIX, 'Material検索範囲', materialScope);
                    console.debug(PREFIX, 'Entity取得経路', this.adapter.lastEntitySource);
                    console.debug(PREFIX, 'Asset取得経路', this.adapter.lastAssetSource);
                    console.debug(PREFIX, '選択経路', this.adapter.lastSelectionSource);
                    console.debug(PREFIX, '選択項目', matched.selectedEntities);
                    console.groupEnd();
                }
            } catch (error) {
                const message = this.errorMessage(error);
                this.panel?.setStatus(`エラー：${message}`, 'error');
                log.error('選択処理エラー', error);
            }
        }

        inspectEntities() {
            try {
                if (!this.adapter?.isAvailable()) {
                    throw new Error('PlayCanvas Editor APIが利用できません。');
                }
                const matcher = new EntityMatcher(this.settings);
                let entities = [];
                let materialAssets = [];
                let scopedMaterialAssets = [];
                let folders = [];
                const listErrors = [];
                try {
                    entities = this.adapter.getAllEntities();
                } catch (error) {
                    listErrors.push(`Entity: ${this.errorMessage(error)}`);
                }
                try {
                    materialAssets = this.adapter.getAllMaterialAssets();
                    const scope = this.getMaterialScope();
                    scopedMaterialAssets = this.adapter.getAllMaterialAssets(
                        scope.folderId,
                        scope.includeSubfolders
                    );
                    folders = this.adapter.getAssetFolders();
                } catch (error) {
                    listErrors.push(`Material Asset: ${this.errorMessage(error)}`);
                }
                if (!entities.length && !materialAssets.length && listErrors.length === 2) {
                    throw new Error(listErrors.join(' / '));
                }

                const entityNames = entities.map((entity) => matcher.getItemName(entity));
                const materialNames = materialAssets.map((asset) => matcher.getItemName(asset));
                const firstEntity = entities[0] || null;
                const firstMaterial = materialAssets[0] || null;
                const firstEntityInternal = firstEntity?.observer || firstEntity?._observer || firstEntity;
                const firstMaterialInternal = firstMaterial?.observer || firstMaterial?._observer || firstMaterial;
                const firstEntityJson = typeof firstEntity?.json === 'function' ? firstEntity.json() : null;
                const firstMaterialJson = typeof firstMaterial?.json === 'function' ? firstMaterial.json() : null;
                const diagnostics = this.adapter.getDiagnostics();
                const selection = this.adapter.getCurrentSelection();
                const selectionType = this.adapter.getCurrentSelectionType();

                console.group(`${PREFIX} Entity / Material情報`);
                console.info(PREFIX, 'Entity総数', entities.length);
                console.info(PREFIX, 'Entity名一覧', entityNames);
                console.info(PREFIX, 'Material Asset総数', materialAssets.length);
                console.info(PREFIX, 'Material Asset名一覧', materialNames);
                console.info(PREFIX, '検索フォルダ', this.getMaterialScopeText());
                console.info(PREFIX, '検索フォルダ内Material数', scopedMaterialAssets.length);
                console.info(PREFIX, 'Assetフォルダ一覧', folders);
                console.info(PREFIX, '最初のEntity（取得オブジェクト）', firstEntity);
                console.info(PREFIX, '最初のEntity（内部Observer）', firstEntityInternal);
                console.info(PREFIX, '最初のEntity（JSON）', firstEntityJson);
                console.info(PREFIX, '最初のMaterial（取得オブジェクト）', firstMaterial);
                console.info(PREFIX, '最初のMaterial（内部Observer）', firstMaterialInternal);
                console.info(PREFIX, '最初のMaterial（JSON）', firstMaterialJson);
                console.info(PREFIX, '利用可能と思われるEditor API', diagnostics);
                console.info(PREFIX, '現在の選択タイプ', selectionType);
                console.info(PREFIX, '現在選択されている項目', selection);
                console.info(PREFIX, 'Entity取得経路', this.adapter.lastEntitySource);
                console.info(PREFIX, 'Asset取得経路', this.adapter.lastAssetSource);
                if (listErrors.length) {
                    console.warn(PREFIX, '一覧取得時の警告', listErrors);
                }
                console.groupEnd();

                this.panel.setStatus(
                    `情報をコンソールへ出力しました。\nEntity：${entities.length}件\nMaterial Asset：${materialAssets.length}件\n検索範囲内：${scopedMaterialAssets.length}件\n現在の選択：${selection.length}件（${selectionType || 'なし'}）`,
                    'success'
                );
            } catch (error) {
                const message = this.errorMessage(error);
                this.panel?.setStatus(`エラー：${message}`, 'error');
                log.error('Entity / Material情報確認エラー', error);
            }
        }

        errorMessage(error) {
            if (error instanceof Error) {
                return error.message;
            }
            return String(error);
        }
    }

    function runSelfTests() {
        const parser = new MayaMelParser();
        const materialNames = Array.from({ length: 27 }, (_, i) => 'Material_' + (i + 1));
        const cases = [
            ['MEL', 'select -r pCube1 pCube2;', ['pCube1', 'pCube2']],
            [
                '引用符付きDAGパス',
                'select -r "|Group|Car|Body" "|Group|Car|Wheel_L";',
                ['|Group|Car|Body', '|Group|Car|Wheel_L']
            ],
            ['namespace', 'select -add vehicle:Body vehicle:Wheel_R;', ['vehicle:Body', 'vehicle:Wheel_R']],
            ['カンマ区切り', 'Body, Wheel_L, Wheel_R', ['Body', 'Wheel_L', 'Wheel_R']],
            [
                '改行',
                'select -r\n    Car_Body\n    Front_Wheel_L\n    Front_Wheel_R;',
                ['Car_Body', 'Front_Wheel_L', 'Front_Wheel_R']
            ],
            [
                'コメント',
                'select -r Body; // Wheel_Rはコメント\n/* Cubeもコメント */ Wheel_L',
                ['Body', 'Wheel_L']
            ],
            ['27件のマテリアル名', `「select -r ${materialNames.join(' ')} ;\n」`, materialNames]
        ];
        const results = [];
        const check = (name, actual, expected) => {
            const passed = JSON.stringify(actual) === JSON.stringify(expected);
            results.push({ name, passed, actual, expected });
        };

        for (const [name, input, expected] of cases) {
            check(name, parser.parse(input).names, expected);
        }

        const matcher = new EntityMatcher(DEFAULT_SETTINGS);
        check(
            '階層・namespace・Shape候補',
            matcher.createCandidates('|Group1|Car|vehicle:BodyShape').map((candidate) => candidate.name),
            ['vehicle:BodyShape', 'BodyShape', 'vehicle:Body', 'Body']
        );

        const mockAssets = [
            { id: 10, name: 'Materials', type: 'folder', path: [] },
            { id: 11, name: 'Interior', type: 'folder', path: [10] },
            { id: 101, name: 'Direct', type: 'material', path: [10] },
            { id: 102, name: 'Nested', type: 'material', path: [10, 11] },
            { id: 103, name: 'Root', type: 'material', path: [] }
        ];
        const adapter = new PlayCanvasEditorAdapter({ assets: { list: () => mockAssets } });
        check(
            '指定フォルダ直下',
            adapter.getAllMaterialAssets('10', false).map((asset) => asset.name),
            ['Direct']
        );
        check(
            '指定フォルダ配下を再帰検索',
            adapter.getAllMaterialAssets('10', true).map((asset) => asset.name),
            ['Direct', 'Nested']
        );
        check(
            'ルート直下',
            adapter.getAllMaterialAssets('root', true).map((asset) => asset.name),
            ['Root']
        );
        check(
            'フォルダのフルパス',
            adapter.getAssetFolders().map((folder) => folder.label),
            ['/Materials', '/Materials/Interior']
        );

        return {
            passed: results.every((result) => result.passed),
            total: results.length,
            results
        };
    }

    // DEBUG時は解析器と、外部ファイル不要のセルフテストをコンソールから利用できます。
    if (DEBUG && typeof window !== 'undefined') {
        const debugApi = Object.freeze({
            parseMayaSelection(source) {
                return new MayaMelParser().parse(source);
            },
            createSearchCandidates(name, settings = DEFAULT_SETTINGS) {
                return new EntityMatcher({ ...DEFAULT_SETTINGS, ...settings }).createCandidates(name);
            },
            runSelfTests() {
                const result = runSelfTests();
                console[result.passed ? 'info' : 'error'](PREFIX, `セルフテスト：${result.total}件`, result);
                return result;
            }
        });
        try {
            Object.defineProperty(window, DEBUG_API_KEY, {
                value: debugApi,
                configurable: true
            });
        } catch (_error) {
            window[DEBUG_API_KEY] = debugApi;
        }
    }

    const application = new MayaSelectApplication();
    application.start();
    ctx.hooks.onShow = () => {
        active = true;
        application.connectToEditor();
    };
    ctx.hooks.onHide = () => {
        active = false;
        application.unbindEditorEvents();
    };

 }
});


// Adapted from the supplied standalone tool. Toolkit owns panel placement.
Toolkit.register({id:"material-remapper",title:"Material 参照置換",description:"フォルダ間の同名Materialを比較し、Model / Renderの参照を置き換えます。",mount(ctx) {
    'use strict';
    const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const inFolder = (asset, id, recursive) => {
        const path = (asset.get('path') || []).map(String);
        return recursive ? path.includes(String(id)) : path.at(-1) === String(id);
    };

    function makePlan(assets, entities, options) {
        const { source, destination, recursive, models, scene } = options;
        if (!source || !destination || source === destination) throw Error('異なる2つのフォルダを指定してください。');
        for (const id of [source, destination]) {
            if (!assets.some(a => String(a.get('id')) === id && a.get('type') === 'folder')) throw Error('フォルダが見つかりません。再読込してください。');
        }
        const index = id => {
            const map = new Map();
            for (const a of assets) {
                if (a.get('type') !== 'material' || !inFolder(a, id, recursive)) continue;
                const name = a.get('name');
                if (!map.has(name)) map.set(name, []);
                map.get(name).push(a);
            }
            return map;
        };
        const src = index(source), dst = index(destination);
        const pairs = [], skipped = [], replacements = new Map(), operations = [], references = [];
        for (const [name, from] of src) {
            const to = dst.get(name) || [];
            if (from.length !== 1 || to.length !== 1) {
                skipped.push(`${name}: ${!to.length ? '移植先に同名なし' : `同名が複数（基準${from.length} / 移植先${to.length}）`}`);
                continue;
            }
            const oldId = from[0].get('id'), newId = to[0].get('id');
            if (String(oldId) === String(newId)) { skipped.push(`${name}: 同じアセット（フォルダ範囲が重複）`); continue; }
            pairs.push({ name, from: oldId, to: Number(newId) });
            replacements.set(String(oldId), Number(newId));
        }
        const op = (kind, item, path, after) => operations.push({ kind, id: item.get(kind === 'asset' ? 'id' : 'resource_id'), path, before: clone(item.get(path)), after: clone(after) });
        const replace = (kind, item, path) => {
            const before = item.get(path), after = replacements.get(String(before));
            if (after === undefined) return false;
            op(kind, item, path, after);
            references.push(`${kind === 'asset' ? 'Model asset' : 'Entity'}: ${item.get('name')} [${item.get(kind === 'asset' ? 'id' : 'resource_id')}] / ${path}: ${before} → ${after}`);
            return true;
        };
        if (models) for (const a of assets) {
            if (a.get('type') !== 'model') continue;
            const mapping = a.get('data.mapping');
            if (!Array.isArray(mapping)) continue;
            const changed = [];
            mapping.forEach((entry, i) => { if (entry && replace('asset', a, `data.mapping.${i}.material`)) changed.push(i); });
            if (changed.length) {
                // Editor's own material drop handler also marks userMapping.
                const path = a.get('meta') == null ? 'meta' : 'meta.userMapping';
                const value = clone(a.get(path)) || {};
                const flags = path === 'meta' ? (value.userMapping ||= {}) : value;
                changed.forEach(i => { flags[i] = true; });
                if (!equal(a.get(path), value)) op('asset', a, path, value);
            }
        }
        if (scene) for (const e of entities) {
            const mapping = e.get('components.model.mapping');
            if (mapping && typeof mapping === 'object') for (const key of Object.keys(mapping)) {
                if (/^\d+$/.test(key)) replace('entity', e, `components.model.mapping.${key}`);
            }
            replace('entity', e, 'components.model.materialAsset');
            const materials = e.get('components.render.materialAssets');
            if (Array.isArray(materials)) materials.forEach((_, i) => replace('entity', e, `components.render.materialAssets.${i}`));
        }
        return { pairs, skipped, operations, references };
    }

    function applyOperations(editor, operations, forward) {
        if (!ctx.isCurrentContext()) throw Error('プロジェクトまたはシーンが変わりました。再読み込みしてください。');
        if (editor.call('permissions:write') !== true) throw Error('このプロジェクトの書き込み権限がありません。');
        const ordered = forward ? operations : [...operations].reverse();
        const resolved = ordered.map(op => {
            const item = editor.call(op.kind === 'asset' ? 'assets:get' : 'entities:get', op.id);
            const expected = forward ? op.before : op.after;
            if (!item || !item.history || !equal(item.get(op.path), expected)) throw Error(`対象が変更・削除されています。再比較してください: ${op.id} / ${op.path}`);
            return { op, item, value: forward ? op.after : op.before, expected };
        });
        const write = (item, path, value) => {
            const enabled = item.history.enabled;
            item.history.enabled = false;
            try {
                if (value === undefined) item.unset(path);
                else item.set(path, clone(value));
                if (!equal(item.get(path), value)) throw Error(`書き込みを確認できません: ${path}`);
            } finally { item.history.enabled = enabled; }
        };
        const done = [];
        try {
            for (const entry of resolved) {
                done.push(entry);
                write(entry.item, entry.op.path, entry.value);
            }
        } catch (error) {
            const failures = [];
            for (const entry of done.reverse()) {
                try { write(entry.item, entry.op.path, entry.expected); } catch (e) { failures.push(e.message); }
            }
            throw Error(`${error.message}${failures.length ? ` / 復元失敗: ${failures.join(', ')}` : '（適用途中の変更は復元しました）'}`);
        }
    }

    const host = document.createElement('div');
    host.id = 'pc-material-remapper';
    ctx.container.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    // Keep UI input away from the Editor's global shortcuts and pointer handlers.
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'wheel']) {
        shadow.addEventListener(type, event => event.stopPropagation());
    }
    shadow.innerHTML = `
        <style>
        :host { all: initial; font: 13px/1.55 system-ui,sans-serif; color:#edf2f7; }
        * { box-sizing:border-box; } button,select { font:inherit; }
        button { background:#354656;color:#fff;border:1px solid #647789;border-radius:5px;padding:7px 12px;cursor:pointer; }
        button:disabled { opacity:.4;cursor:default; } button:hover:not(:disabled){background:#465f73;}
        #toggle { position:fixed;right:20px;bottom:24px;z-index:100000; }
        #panel { position:fixed;right:20px;bottom:72px;z-index:100000;width:min(640px,calc(100vw - 40px));max-height:80vh;overflow:auto;background:#202931;border:1px solid #607181;border-radius:9px;padding:18px;box-shadow:0 12px 50px #0008; }
        [hidden] { display:none!important; } h2 {font-size:17px;margin:0 0 10px;} p {margin:8px 0;} select {width:100%;background:#111b23;color:#fff;padding:7px;margin:4px 0 10px;} label {display:block;} .actions {display:flex;gap:8px;margin:12px 0;} #apply {background:#146850;} pre {white-space:pre-wrap;overflow-wrap:anywhere;max-height:290px;overflow:auto;background:#141c23;padding:12px;font:12px/1.6 monospace;} .muted {color:#b8c9d7;} #status {white-space:pre-wrap;}
        </style>
        <style>
        .folder-open {display:block;width:100%;text-align:left;margin:4px 0 10px;overflow-wrap:anywhere;}
        #folder-picker {border:1px solid #647789;padding:10px;margin:10px 0;border-radius:5px;}
        #folder-search {width:100%;padding:8px;background:#111b23;color:#fff;border:1px solid #647789;font:inherit;}
        #folder-list {max-height:180px;overflow:auto;margin:8px 0;}
        #folder-list button {display:block;width:100%;text-align:left;margin:3px 0;overflow-wrap:anywhere;}
        </style>
        <button id="toggle">マテリアル移植</button>
        <section id="panel" hidden>
          <h2>同名マテリアルへの割り当て変更</h2>
          <p class="muted">基準フォルダのマテリアルを参照する箇所を、移植先の同名マテリアルへ変更します。</p>
          <div>基準フォルダ（現在の参照元）<input id="source" type="hidden"><button id="source-open" class="folder-open">フォルダを選択…</button></div>
          <div>移植先フォルダ（新しい参照先）<input id="destination" type="hidden"><button id="destination-open" class="folder-open">フォルダを選択…</button></div>
          <section id="folder-picker" hidden>
            <strong id="folder-title"></strong>
            <input id="folder-search" type="search" placeholder="フォルダ名・パス・IDで検索" aria-label="フォルダ検索">
            <div id="folder-list"></div>
            <button id="folder-close">閉じる</button>
          </section>
          <label><input id="recursive" type="checkbox" checked> 両方のサブフォルダを含める</label>
          <label><input id="models" type="checkbox" checked> プロジェクト全体の旧Modelアセットを変更</label>
          <label><input id="scene" type="checkbox" checked> 現在のシーンのModel / Renderコンポーネントを変更</label>
          <p class="muted">共有Modelアセットの変更は、そのアセットを利用する他のシーンにも影響します。未読込シーンのコンポーネントとTemplateアセットは対象外です。</p>
          <div class="actions"><button id="refresh">フォルダ再読込</button><button id="preview">比較・プレビュー</button><button id="apply" disabled>置き換え実行</button></div>
          <div id="status" role="status">Editorの読込完了後にフォルダを選択してください。</div>
          <pre id="report" hidden></pre>
        </section>`;
    const embedded = document.createElement('style');
    embedded.textContent = ':host{display:block}#toggle,h2{display:none}#panel{position:static;width:100%;max-height:none;border:0;box-shadow:none;padding:12px}.actions{flex-wrap:wrap}';
    shadow.append(embedded);
    const $ = id => shadow.getElementById(id);
    $('panel').hidden = false;
    let plan = null;
    let folders = [], pickerTarget = null;
    const editor = () => {
        if (!ctx.isCurrentContext()) throw Error('Editorの準備完了を待つか、ページを再読み込みしてください。');
        const e = window.editor;
        if (!e || typeof e.call !== 'function') throw Error('Editor APIが見つかりません。シーンを開き、Tampermonkeyのサイトアクセスとユーザースクリプト実行設定を確認してください。');
        return e;
    };
    const options = () => ({ source: $('source').value, destination: $('destination').value, recursive: $('recursive').checked, models: $('models').checked, scene: $('scene').checked });
    const readPlan = () => {
        const e = editor(), assets = e.call('assets:list'), entities = e.call('entities:list');
        if (!Array.isArray(assets) || !Array.isArray(entities)) throw Error('Editorのアセット・シーン読込を待ってください。');
        return makePlan(assets, entities, options());
    };
    const invalidate = () => { plan = null; $('apply').disabled = true; };
    const guard = fn => () => { try { fn(); } catch (e) { invalidate(); $('status').textContent = `エラー: ${e.message}`; console.error('[Material Remapper]', e); } };
    function refresh() {
        invalidate();
        const assets = editor().call('assets:list');
        if (!Array.isArray(assets)) throw Error('アセット読込を待って再読込してください。');
        const names = new Map(assets.map(a => [String(a.get('id')), a.get('name')]));
        folders = assets.filter(a => a.get('type') === 'folder').map(a => ({ id: String(a.get('id')), label: '/' + [...(a.get('path') || []).map(id => names.get(String(id)) || `#${id}`), a.get('name')].join('/') + ` [${a.get('id')}]` })).sort((a,b) => a.label.localeCompare(b.label));
        for (const id of ['source', 'destination']) {
            const selected = folders.find(f => f.id === $(id).value);
            $(id).value = selected?.id || '';
            $(`${id}-open`).textContent = selected?.label || 'フォルダを選択…';
        }
        $('status').textContent = folders.length ? `${folders.length} フォルダを読み込みました。` : `フォルダが見つかりません（取得アセット ${assets.length} 件）。EditorのAssets読込完了後に「フォルダ再読込」を押してください。`;
        if (pickerTarget) renderFolders();
        $('report').hidden = true;
    }
    function renderFolders() {
        const query = $('folder-search').value.toLocaleLowerCase();
        const matches = folders.filter(f => f.label.toLocaleLowerCase().includes(query));
        $('folder-list').replaceChildren();
        if (!matches.length) $('folder-list').textContent = folders.length ? '検索条件に一致するフォルダはありません。' : 'フォルダ一覧が空です。「フォルダ再読込」を押してください。';
        for (const folder of matches) {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = folder.label;
            button.onclick = () => {
                $(pickerTarget).value = folder.id;
                $(`${pickerTarget}-open`).textContent = folder.label;
                $('folder-picker').hidden = true;
                pickerTarget = null;
                invalidate();
                $('report').hidden = true;
                $('status').textContent = 'フォルダを選択しました。「比較・プレビュー」を押してください。';
            };
            $('folder-list').append(button);
        }
    }
    for (const id of ['source', 'destination']) $(`${id}-open`).onclick = guard(() => {
        pickerTarget = id;
        $('folder-title').textContent = id === 'source' ? '基準フォルダを選択' : '移植先フォルダを選択';
        $('folder-picker').hidden = false;
        $('folder-search').value = '';
        $('folder-list').textContent = '読み込み中…';
        try { refresh(); }
        catch (error) { $('folder-list').textContent = `一覧を取得できません: ${error.message}`; throw error; }
        $('folder-search').focus();
    });
    $('folder-search').oninput = renderFolders;
    $('folder-close').onclick = () => { $('folder-picker').hidden = true; pickerTarget = null; };
    ctx.hooks.onShow = guard(refresh);
    ctx.hooks.onHide = invalidate;
    $('refresh').onclick = guard(refresh);
    for (const id of ['source', 'destination', 'recursive', 'models', 'scene']) $(id).onchange = () => { invalidate(); $('status').textContent = '設定が変わりました。再比較してください。'; $('report').hidden = true; };
    $('preview').onclick = guard(() => {
        invalidate();
        plan = readPlan();
        $('report').hidden = false;
        $('report').textContent = [
            '【対応するマテリアル】', ...plan.pairs.map(p => `${p.name}: ${p.from} → ${p.to}`),
            '', '【スキップ】', ...plan.skipped,
            '', '【変更する参照】', ...plan.references
        ].join('\n');
        $('status').textContent = `一致 ${plan.pairs.length} 組 / スキップ ${plan.skipped.length} 件 / 変更する参照 ${plan.references.length} 件。`;
        $('apply').disabled = !plan.references.length;
    });
    $('apply').onclick = guard(() => {
        if (!plan) return;
        const e = editor(), history = e.api?.globals?.history;
        if (typeof history?.add !== 'function') throw Error('対応するEditorの履歴APIがありません。変更は実行しません。');
        const fresh = readPlan();
        if (!equal(plan, fresh)) throw Error('比較後に対象データが変わりました。再比較してください。');
        const operations = plan.operations, count = plan.references.length;
        applyOperations(e, operations, true);
        const replay = forward => {
            try { applyOperations(e, operations, forward); $('status').textContent = forward ? `${count} 件を再適用しました。` : `${count} 件を元に戻しました。`; }
            catch (error) { $('status').textContent = `履歴操作を中止しました: ${error.message}`; throw error; }
            finally { invalidate(); }
        };
        try { if (history.add({ name: `Material folder remap (${count})`, combine: false, undo: () => replay(false), redo: () => replay(true) }) === false) throw Error('履歴登録が拒否されました。'); }
        catch (error) { applyOperations(e, operations, false); throw error; }
        invalidate();
        $('status').textContent = `${count} 件の参照を変更しました。EditorのUndoでまとめて戻せます。同期完了を確認してください。`;
    });

}});


// Adapted from the supplied standalone tool. Toolkit owns panel placement.
Toolkit.register({id:"render-settings",title:"Render タグ・Layersコピー",description:"選択階層のタグ・Layersを保存し、別階層の同名Renderエンティティへ適用します。",mount(ctx) {
    'use strict';
    const PANEL_ID = 'pc-render-settings-copier';
    const PREFIX = 'pc-render-settings-copier:v1:';
    const TAGS = 'tags';
    const LAYERS = 'components.render.layers';
    const clone = value => JSON.parse(JSON.stringify(value));
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    let saved = null;
    let savedKey = '';
    let status;

    function api() {
        if (!ctx.isCurrentContext()) throw new Error('Editorの準備完了を待つか、ページを再読み込みしてください。');
        const value = window.editor?.api?.globals;
        if (!value?.entities?.root || !value.selection || !value.history) {
            throw new Error('Editorの読み込み完了後に操作してください。');
        }
        return value;
    }

    function key() {
        return PREFIX + location.pathname;
    }

    function readSettings(entity) {
        const tags = entity.get(TAGS);
        const layers = entity.get(LAYERS);
        if (!Array.isArray(tags) || !tags.every(x => typeof x === 'string') ||
            !Array.isArray(layers) || !layers.every(Number.isInteger)) {
            throw new Error(`「${entity.get('name')}」のタグまたはLayersを取得できません。`);
        }
        return { tags: [...tags], layers: [...layers] };
    }

    function validSaved(value) {
        return value?.version === 1 && typeof value.rootName === 'string' &&
            Array.isArray(value.entries) && value.entries.every(entry =>
                typeof entry.name === 'string' && Array.isArray(entry.tags) &&
                entry.tags.every(x => typeof x === 'string') &&
                Array.isArray(entry.layers) && entry.layers.every(Number.isInteger));
    }

    function loadSaved() {
        if (savedKey === key()) return;
        savedKey = key();
        saved = null;
        try {
            const value = JSON.parse(sessionStorage.getItem(savedKey));
            if (validSaved(value)) saved = value;
        } catch (error) {
            console.warn('[Render Copier] 保存データを読み込めません。', error);
        }
    }

    function selectedRoot() {
        const current = api();
        const items = current.selection.items;
        const id = items.length === 1 && items[0].get('resource_id');
        const entity = id && current.entities.get(id);
        if (!entity) throw new Error('ヒエラルキーで親エンティティを1つ選択してください。');
        return entity;
    }

    function renders(root) {
        const result = [];
        const stack = [root];
        const seen = new Set();
        while (stack.length) {
            const entity = stack.pop();
            const id = entity.get('resource_id');
            if (seen.has(id)) continue;
            seen.add(id);
            if (entity.get('components.render')) result.push(entity);
            stack.push(...entity.children);
        }
        return result;
    }

    function buildIndex(entries) {
        const index = new Map();
        const conflicts = new Set();
        const canonical = entry => JSON.stringify([
            [...new Set(entry.tags)].sort(), [...new Set(entry.layers)].sort((a, b) => a - b)
        ]);
        for (const entry of entries) {
            if (index.has(entry.name) && canonical(index.get(entry.name)) !== canonical(entry)) {
                conflicts.add(entry.name);
            } else {
                index.set(entry.name, entry);
            }
        }
        for (const name of conflicts) index.delete(name);
        return { index, conflicts };
    }

    function capture() {
        loadSaved();
        const root = selectedRoot();
        const entries = renders(root).map(entity => ({
            name: entity.get('name'), ...readSettings(entity)
        }));
        if (!entries.length) throw new Error('選択階層にrenderコンポーネントがありません。');
        saved = { version: 1, rootName: root.get('name'), entries };
        let persistence = '再読み込み後もこのタブで利用できます。';
        try { sessionStorage.setItem(savedKey, JSON.stringify(saved)); }
        catch { persistence = 'ブラウザー保存不可：再読み込みまで利用できます。'; }
        const { index, conflicts } = buildIndex(entries);
        return `保存元：${saved.rootName}\nrender ${entries.length}件／利用可能な名前 ${index.size}件\n` +
            `設定が異なる同名：${conflicts.size}件（適用時にスキップ）\n${persistence}`;
    }

    function plan() {
        loadSaved();
        if (!saved) throw new Error('先にコピー元の階層を選択して「保存」してください。');
        const root = selectedRoot();
        const { index, conflicts } = buildIndex(saved.entries);
        const patches = [];
        const counts = { matched: 0, unchanged: 0, absent: 0, conflict: 0 };
        const rows = [];
        for (const entity of renders(root)) {
            const name = entity.get('name');
            let result;
            if (conflicts.has(name)) { counts.conflict++; result = '保存元の同名設定が競合'; }
            else if (!index.has(name)) { counts.absent++; result = '名前が未一致'; }
            else {
                counts.matched++;
                const before = readSettings(entity);
                const entry = index.get(name);
                const after = { tags: [...entry.tags], layers: [...entry.layers] };
                if (equal(before, after)) { counts.unchanged++; result = '変更なし'; }
                else {
                    patches.push({ id: entity.get('resource_id'), before, after });
                    result = '変更対象';
                }
            }
            rows.push({ name, id: entity.get('resource_id'), result });
        }
        return { rootName: root.get('name'), patches, counts, rows };
    }

    // Disable per-property history only while writing. Re-resolve IDs on undo/redo.
    function write(entity, values) {
        const history = entity.history;
        if (typeof history?.enabled !== 'boolean') throw new Error('Editorの履歴APIを利用できません。');
        const enabled = history.enabled;
        history.enabled = false;
        try {
            for (const [path, value] of [[TAGS, values.tags], [LAYERS, values.layers]]) {
                if (!equal(entity.get(path), value)) {
                    entity.set(path, [...value]);
                    if (!equal(entity.get(path), value)) throw new Error(`設定の書き込みに失敗：${path}`);
                }
            }
        } finally { history.enabled = enabled; }
    }

    function transaction(patches, side, sceneKey) {
        if (key() !== sceneKey) throw new Error('シーンが変わったため操作を中止しました。');
        if (window.editor.call('permissions:write') !== true) throw new Error('シーンの編集権限がありません。');
        const current = api();
        const rollback = [];
        try {
            for (const patch of patches) {
                const entity = current.entities.get(patch.id);
                // A deleted entity/component must not be recreated by undo/redo.
                if (!entity?.get('components.render')) continue;
                rollback.push({ entity, values: readSettings(entity) });
                write(entity, patch[side]);
            }
        } catch (error) {
            const failures = [];
            for (const item of rollback.reverse()) {
                try { write(item.entity, item.values); } catch (failure) { failures.push(failure); }
            }
            if (failures.length) throw new Error(`${error.message}\n一部の復元に失敗しました。Inspectorを確認してください。`);
            throw error;
        }
    }

    function summary(value, applied) {
        const c = value.counts;
        console.table(value.rows);
        return `適用先：${value.rootName}\n${applied ? '適用' : '変更予定'}：${value.patches.length}件\n` +
            `一致：${c.matched}件（変更なし ${c.unchanged}件）\n` +
            `未一致：${c.absent}件／同名競合：${c.conflict}件\n` +
            (applied ? 'EditorのUndoで一括して戻せます。' : 'この時点では変更していません。') +
            '\n詳細はブラウザーのコンソールに表示しました。';
    }

    function apply() {
        const value = plan();
        if (!value.patches.length) return summary(value, false);
        const sceneKey = key();
        const patches = clone(value.patches);
        transaction(patches, 'after', sceneKey);
        try {
            if (api().history.add({
                name: `Render Tags / Layers (${patches.length})`,
                undo: () => transaction(patches, 'before', sceneKey),
                redo: () => transaction(patches, 'after', sceneKey)
            }) === false) throw new Error('履歴登録が拒否されました。');
        } catch (error) {
            transaction(patches, 'before', sceneKey);
            throw error;
        }
        return summary(value, true);
    }

    function mount() {
        if (ctx.container.querySelector(`#${PANEL_ID}`)) return;
        const host = document.createElement('div');
        host.id = PANEL_ID;
        host.style.cssText = 'display:block;width:100%';
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `<style>
            :host { color-scheme:dark; font:13px/1.55 system-ui,sans-serif; }
            section { width:300px;max-width:calc(100vw - 24px);background:#242a30;color:#e9edf1;border:1px solid #53606c;border-radius:8px;box-shadow:0 5px 24px #0007; }
            header { padding:9px 12px;display:flex;align-items:center;justify-content:space-between;cursor:move;touch-action:none; }
            main { padding:0 12px 12px; }
            p { margin:6px 0 10px;color:#bac5ce; }
            button { font:inherit;color:#fff;background:#394854;border:1px solid #637481;border-radius:4px;padding:6px 9px;cursor:pointer; }
            button:hover { background:#506579; } .buttons { display:flex;gap:5px;flex-wrap:wrap; }
            output { display:block;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:10px;max-height:240px;overflow:auto; }
            [hidden] { display:none; }
        </style><section><header><strong>Render タグ・Layersコピー</strong><button id="toggle" title="折りたたみ">−</button></header>
        <main><p>親を1つ選択 → 保存 → 別の親を選択 → 適用<br>選択した親自身も対象／名前は完全一致<br>タグ・Layersは空の値も含めて上書き</p>
        <div class="buttons"><button id="capture">① 保存</button><button id="preview">対象確認</button><button id="apply">② 適用</button></div>
        <output role="status" aria-live="polite"></output></main></section>`;
        status = shadow.querySelector('output');
        loadSaved();
        status.textContent = saved ? `保存済み：${saved.rootName}（${saved.entries.length}件）` : 'コピー元の親エンティティを選択してください。';
        for (const [id, action] of [['capture', capture], ['preview', () => summary(plan(), false)], ['apply', apply]]) {
            shadow.getElementById(id).addEventListener('click', () => {
                try { status.textContent = action(); }
                catch (error) { status.textContent = `エラー：${error.message}`; console.error('[Render Copier]', error); }
            });
        }
        const embedded = document.createElement('style');
        embedded.textContent = 'section{width:100%;max-width:none;border:0;box-shadow:none}header{display:none}main{padding:12px}';
        shadow.append(embedded);
        // Keep panel clicks from reaching Editor selection/keyboard handlers.
        for (const event of ['pointerdown', 'mousedown', 'click', 'dblclick', 'keydown', 'keyup']) {
            host.addEventListener(event, e => e.stopPropagation());
        }
        ctx.container.append(host);
    }

    mount();

}});

Toolkit.boot();
})();
