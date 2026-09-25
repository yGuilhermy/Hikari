const path = require('path');
const fs = require('fs');
const config = require('../config');

const dbPath = path.join(__dirname, '../data/ai_database.json');

let database = {};

let runtimeSettings = {
    aiDbRead: true,
    aiDbWrite: true,
    aiDbEdit: true,
    aiDbDelete: true
};

function loadDatabase() {
    try {
        if (fs.existsSync(dbPath)) {
            const raw = fs.readFileSync(dbPath, 'utf8');
            database = JSON.parse(raw);
        } else {
            database = {};
            saveDatabase();
        }
    } catch (e) {
        database = {};
    }
}

function saveDatabase() {
    try {
        const tmpPath = `${dbPath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(database, null, 2), 'utf8');
        fs.renameSync(tmpPath, dbPath);
        return true;
    } catch (e) {
        return false;
    }
}

function getDbSettings() {
    return {
        aiDbRead: runtimeSettings.aiDbRead && (config.aiDbReadEnabled !== false),
        aiDbWrite: runtimeSettings.aiDbWrite && (config.aiDbWriteEnabled !== false),
        aiDbEdit: runtimeSettings.aiDbEdit && (config.aiDbEditEnabled !== false),
        aiDbDelete: runtimeSettings.aiDbDelete && (config.aiDbDeleteEnabled !== false)
    };
}

function updateDbSetting(key, value) {
    if (runtimeSettings[key] !== undefined) {
        runtimeSettings[key] = Boolean(value);
        return true;
    }
    return false;
}

function canRead(guildId = null) {
    const settings = getDbSettings();
    if (!settings.aiDbRead) return false;
    if (guildId) {
        try {
            const { isToolDisabled } = require('./llmHandler');
            if (typeof isToolDisabled === 'function' && isToolDisabled(guildId, 'db_read')) {
                return false;
            }
        } catch (_) {}
    }
    return true;
}

function canWrite(guildId = null) {
    if (!canRead(guildId)) return false;
    const settings = getDbSettings();
    if (!settings.aiDbWrite) return false;
    if (guildId) {
        try {
            const { isToolDisabled } = require('./llmHandler');
            if (typeof isToolDisabled === 'function' && isToolDisabled(guildId, 'db_write')) {
                return false;
            }
        } catch (_) {}
    }
    return true;
}

function canEdit(guildId = null) {
    if (!canRead(guildId)) return false;
    const settings = getDbSettings();
    if (!settings.aiDbEdit) return false;
    if (guildId) {
        try {
            const { isToolDisabled } = require('./llmHandler');
            if (typeof isToolDisabled === 'function' && isToolDisabled(guildId, 'db_edit')) {
                return false;
            }
        } catch (_) {}
    }
    return true;
}

function canDelete(guildId = null) {
    if (!canRead(guildId)) return false;
    const settings = getDbSettings();
    if (!settings.aiDbDelete) return false;
    if (guildId) {
        try {
            const { isToolDisabled } = require('./llmHandler');
            if (typeof isToolDisabled === 'function' && isToolDisabled(guildId, 'db_delete')) {
                return false;
            }
        } catch (_) {}
    }
    return true;
}

const BULK_KEYWORDS = new Set(['*', 'all', 'todos', 'tudo', 'todas', 'dump', 'banco', 'banco de dados', 'database', 'geral', 'global', 'completo', 'full']);

function isBulkQuery(key) {
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey) return true;
    return BULK_KEYWORDS.has(cleanKey);
}

function findMatchingKeys(key) {
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey) return [];
    const keys = Object.keys(database);
    const matched = new Set();

    if (database[cleanKey]) {
        matched.add(cleanKey);
    }
    for (const k of keys) {
        const lower = k.toLowerCase();
        if (lower === cleanKey) {
            matched.add(k);
        }
    }
    for (const k of keys) {
        const lower = k.toLowerCase();
        if (lower.startsWith(`${cleanKey}_`) || lower.startsWith(`${cleanKey}-`) || lower.startsWith(`${cleanKey} `) || lower.includes(cleanKey)) {
            matched.add(k);
        }
    }
    if (matched.size === 0) {
        for (const k of keys) {
            const lower = k.toLowerCase();
            if (cleanKey.includes(lower)) {
                matched.add(k);
            }
        }
    }
    if (matched.size === 0) {
        const normCleanKey = cleanKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const k of keys) {
            const item = database[k];
            if (!item) continue;
            const rawText = typeof item === 'object' ? JSON.stringify(item).toLowerCase() : String(item).toLowerCase();
            const normText = rawText.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (rawText.includes(cleanKey) || normText.includes(normCleanKey)) {
                matched.add(k);
            }
        }
    }
    return Array.from(matched);
}

function findMatchingKey(key) {
    const keys = findMatchingKeys(key);
    return keys.length > 0 ? keys[0] : null;
}

function formatSingleEntry(entry) {
    if (typeof entry === 'object' && entry !== null) {
        const keys = Object.keys(entry).filter(k => k !== 'protected' && k !== 'updatedAt');
        if (keys.length === 1 && (entry.content || entry.resumo)) {
            return entry.content || entry.resumo;
        }
        return keys
            .map(k => `${k}: ${typeof entry[k] === 'object' ? JSON.stringify(entry[k]) : entry[k]}`)
            .join('\n');
    }
    return String(entry);
}

function readDb(key, guildId = null, isOwner = false) {
    if (!canRead(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A leitura do banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    if (isBulkQuery(cleanKey) && !isOwner) {
        return {
            success: false,
            error: 'bulk_denied',
            message: 'Consultas globais ou em massa ao banco de dados são restritas por segurança e privacidade.'
        };
    }

    const matchedKeys = findMatchingKeys(cleanKey);
    const totalKeys = Object.keys(database).length;
    if (matchedKeys.length === 0) {
        return {
            success: false,
            error: 'not_found',
            key: cleanKey,
            availableKeys: Object.keys(database),
            message: `Nenhum dado encontrado para a chave "${key}".`
        };
    }

    if (matchedKeys.length === totalKeys && totalKeys > 3 && !isOwner) {
        return {
            success: false,
            error: 'bulk_denied',
            message: 'Consultas globais ou em massa ao banco de dados são restritas por segurança e privacidade.'
        };
    }

    if (matchedKeys.length === 1) {
        const resolvedKey = matchedKeys[0];
        const entry = database[resolvedKey];
        const formatted = formatSingleEntry(entry);
        return {
            success: true,
            key: resolvedKey,
            data: entry,
            formatted,
            isProtected: Boolean(entry && entry.protected),
            count: 1
        };
    }

    const entriesData = {};
    const formattedBlocks = [];
    for (const k of matchedKeys) {
        const item = database[k];
        entriesData[k] = item;
        const block = formatSingleEntry(item);
        formattedBlocks.push(`--- Registro: "${k}" ---\n${block}`);
    }
    const formatted = `[${matchedKeys.length} registros encontrados para "${key}"]:\n\n${formattedBlocks.join('\n\n')}`;
    return {
        success: true,
        key: cleanKey,
        data: entriesData,
        formatted,
        matchedKeys,
        count: matchedKeys.length,
        isProtected: matchedKeys.some(k => database[k] && database[k].protected)
    };
}

function writeDb(key, data, guildId = null, isOwner = false, meta = {}) {
    if (!canWrite(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A gravação no banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey) {
        return {
            success: false,
            error: 'invalid_key',
            message: 'Chave inválida fornecida para gravação.'
        };
    }
    if (['__proto__', 'constructor', 'prototype'].includes(cleanKey)) {
        return {
            success: false,
            error: 'reserved_key',
            message: 'Chave reservada inválida.'
        };
    }
    const existing = database[cleanKey];
    if (existing && existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${cleanKey}" é protegido pelo criador e não pode ser sobrescrito.`
        };
    }
    const salvoPor = meta.salvo_por || (meta.userTag && meta.userId ? `${meta.userTag} - ${meta.userId}` : (existing && existing.salvo_por ? existing.salvo_por : null));
    const savedById = meta.savedById || meta.userId || (existing && existing.savedById ? existing.savedById : null);
    const savedByTag = meta.savedByTag || meta.userTag || (existing && existing.savedByTag ? existing.savedByTag : null);
    const isImportant = meta.important !== undefined ? Boolean(meta.important) : (existing && existing.important !== undefined ? Boolean(existing.important) : false);

    let recordToSave;
    if (typeof data === 'object' && data !== null) {
        recordToSave = {
            ...data,
            protected: existing ? Boolean(existing.protected) : false,
            salvo_por: salvoPor,
            savedById: savedById,
            savedByTag: savedByTag,
            important: isImportant,
            updatedAt: new Date().toISOString()
        };
    } else {
        recordToSave = {
            content: String(data),
            protected: existing ? Boolean(existing.protected) : false,
            salvo_por: salvoPor,
            savedById: savedById,
            savedByTag: savedByTag,
            important: isImportant,
            updatedAt: new Date().toISOString()
        };
    }
    database[cleanKey] = recordToSave;
    saveDatabase();
    return {
        success: true,
        key: cleanKey,
        data: recordToSave,
        message: `Dados gravados com sucesso na chave "${cleanKey}".`
    };
}

function editDb(key, newContent, options = {}, guildId = null, userContext = {}, meta = {}) {
    if (!canEdit(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A edição no banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey) {
        return {
            success: false,
            error: 'invalid_key',
            message: 'Chave inválida fornecida para edição.'
        };
    }
    if (['__proto__', 'constructor', 'prototype'].includes(cleanKey)) {
        return {
            success: false,
            error: 'reserved_key',
            message: 'Chave reservada inválida.'
        };
    }
    const resolvedKey = findMatchingKey(cleanKey);
    if (!resolvedKey || !database[resolvedKey]) {
        return {
            success: false,
            error: 'not_found',
            message: `O registro "${cleanKey}" não foi encontrado no banco de dados para ser editado. Utilize db_write se desejar criar uma nova anotação.`
        };
    }
    const existing = database[resolvedKey];
    const isOwner = typeof userContext === 'boolean' ? userContext : Boolean(userContext && userContext.isOwner);
    const isStaff = typeof userContext === 'object' && userContext !== null ? Boolean(userContext.isStaff || userContext.isAdmin) : false;
    const currentUserId = typeof userContext === 'object' && userContext !== null ? userContext.userId : (meta && meta.userId ? meta.userId : null);

    if (existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${resolvedKey}" é protegido pelo criador e não pode ser alterado.`
        };
    }

    const isAuthor = Boolean(existing.savedById && currentUserId && String(existing.savedById) === String(currentUserId));
    const isImportant = Boolean(existing.important);

    if (isImportant && !isOwner && !isStaff && !isAuthor) {
        return {
            success: false,
            error: 'author_confirmation_required',
            key: resolvedKey,
            savedBy: existing.salvo_por || existing.savedByTag || 'outro usuário',
            savedById: existing.savedById || null,
            message: `O registro "${resolvedKey}" é importante e foi salvo por ${existing.salvo_por || existing.savedByTag || 'outro usuário'}. Apenas o próprio autor ou a administração podem autorizar a edição.`
        };
    }

    const shouldAppend = typeof options === 'boolean' ? options : Boolean(options && options.append);
    let updatedContent = String(newContent || '').trim();

    const salvoPor = existing.salvo_por || meta.salvo_por || (meta.userTag && meta.userId ? `${meta.userTag} - ${meta.userId}` : null);
    const savedById = existing.savedById || meta.savedById || meta.userId || null;
    const savedByTag = existing.savedByTag || meta.savedByTag || meta.userTag || null;
    const nextImportant = options.important !== undefined ? Boolean(options.important) : (meta.important !== undefined ? Boolean(meta.important) : (existing.important !== undefined ? Boolean(existing.important) : false));

    let recordToSave;
    if (typeof existing === 'object' && existing !== null) {
        let finalContent = updatedContent;
        if (shouldAppend) {
            const baseContent = existing.content || existing.resumo || '';
            finalContent = baseContent ? `${baseContent}\n${updatedContent}`.trim() : updatedContent;
        }

        recordToSave = {
            ...existing,
            content: finalContent,
            resumo: finalContent,
            protected: Boolean(existing.protected),
            salvo_por: salvoPor,
            savedById: savedById,
            savedByTag: savedByTag,
            important: nextImportant,
            updatedAt: new Date().toISOString()
        };
    } else {
        let finalContent = updatedContent;
        if (shouldAppend && existing) {
            finalContent = `${String(existing)}\n${updatedContent}`.trim();
        }
        recordToSave = {
            content: finalContent,
            protected: false,
            salvo_por: salvoPor,
            savedById: savedById,
            savedByTag: savedByTag,
            important: nextImportant,
            updatedAt: new Date().toISOString()
        };
    }

    database[resolvedKey] = recordToSave;
    saveDatabase();
    return {
        success: true,
        key: resolvedKey,
        data: recordToSave,
        message: `Registro "${resolvedKey}" atualizado com sucesso no banco de dados.`
    };
}

function deleteDb(key, guildId = null, userContext = {}) {
    if (!canDelete(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A exclusão no banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!cleanKey || ['__proto__', 'constructor', 'prototype'].includes(cleanKey)) {
        return {
            success: false,
            error: 'invalid_key',
            message: 'Chave inválida fornecida para exclusão.'
        };
    }
    const resolvedKey = findMatchingKey(cleanKey);
    if (!resolvedKey || !database[resolvedKey]) {
        return {
            success: false,
            error: 'not_found',
            message: `Registro "${cleanKey}" não encontrado para exclusão.`
        };
    }
    const existing = database[resolvedKey];
    const isOwner = typeof userContext === 'boolean' ? userContext : Boolean(userContext && userContext.isOwner);
    const isStaff = typeof userContext === 'object' && userContext !== null ? Boolean(userContext.isStaff || userContext.isAdmin) : false;
    const currentUserId = typeof userContext === 'object' && userContext !== null ? userContext.userId : null;

    if (existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${resolvedKey}" é protegido pelo criador e não pode ser excluído.`
        };
    }

    const isAuthor = Boolean(existing.savedById && currentUserId && String(existing.savedById) === String(currentUserId));
    const isImportant = Boolean(existing.important);

    if (isImportant && !isOwner && !isStaff && !isAuthor) {
        return {
            success: false,
            error: 'author_confirmation_required',
            key: resolvedKey,
            savedBy: existing.salvo_por || existing.savedByTag || 'outro usuário',
            savedById: existing.savedById || null,
            message: `O registro "${resolvedKey}" é importante e foi salvo por ${existing.salvo_por || existing.savedByTag || 'outro usuário'}. Apenas o próprio autor ou a administração podem autorizar a exclusão.`
        };
    }

    delete database[resolvedKey];
    saveDatabase();
    return {
        success: true,
        key: resolvedKey,
        message: `Registro "${resolvedKey}" excluído com sucesso.`
    };
}

function listDbKeys(guildId = null) {
    if (!canRead(guildId)) {
        return {
            success: false,
            error: 'disabled',
            keys: []
        };
    }
    loadDatabase();
    const entries = Object.keys(database).map(k => ({
        key: k,
        isProtected: Boolean(database[k] && database[k].protected)
    }));
    return {
        success: true,
        keys: entries
    };
}

function setProtection(key, isProtected) {
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    if (!database[cleanKey]) {
        return false;
    }
    database[cleanKey].protected = Boolean(isProtected);
    saveDatabase();
    return true;
}

loadDatabase();

module.exports = {
    loadDatabase,
    saveDatabase,
    getDbSettings,
    updateDbSetting,
    canRead,
    canWrite,
    canEdit,
    canDelete,
    findMatchingKey,
    findMatchingKeys,
    isBulkQuery,
    readDb,
    writeDb,
    editDb,
    deleteDb,
    listDbKeys,
    setProtection
};
