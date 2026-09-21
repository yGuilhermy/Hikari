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
        fs.writeFileSync(dbPath, JSON.stringify(database, null, 2), 'utf8');
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

function readDb(key, guildId = null) {
    if (!canRead(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A leitura do banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    const entry = database[cleanKey];
    if (!entry) {
        return {
            success: false,
            error: 'not_found',
            message: `Nenhum dado encontrado para a chave "${key}".`
        };
    }
    let formatted = '';
    if (typeof entry === 'object') {
        if (entry.resumo) {
            formatted = entry.resumo;
        } else {
            formatted = Object.entries(entry)
                .filter(([k]) => k !== 'protected')
                .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                .join('\n');
        }
    } else {
        formatted = String(entry);
    }
    return {
        success: true,
        key: cleanKey,
        data: entry,
        formatted,
        isProtected: Boolean(entry && entry.protected)
    };
}

function writeDb(key, data, guildId = null, isOwner = false) {
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
    const existing = database[cleanKey];
    if (existing && existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${cleanKey}" é protegido pelo criador e não pode ser sobrescrito.`
        };
    }
    let recordToSave;
    if (typeof data === 'object' && data !== null) {
        recordToSave = {
            ...data,
            protected: existing ? Boolean(existing.protected) : false,
            updatedAt: new Date().toISOString()
        };
    } else {
        recordToSave = {
            content: String(data),
            protected: existing ? Boolean(existing.protected) : false,
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

function editDb(key, newContent, options = {}, guildId = null, isOwner = false) {
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
    const existing = database[cleanKey];
    if (!existing) {
        return {
            success: false,
            error: 'not_found',
            message: `O registro "${cleanKey}" não foi encontrado no banco de dados para ser editado. Utilize db_write se desejar criar uma nova anotação.`
        };
    }
    if (existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${cleanKey}" é protegido pelo criador e não pode ser alterado.`
        };
    }

    const shouldAppend = typeof options === 'boolean' ? options : Boolean(options && options.append);
    let updatedContent = String(newContent || '').trim();

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
            updatedAt: new Date().toISOString()
        };
    }

    database[cleanKey] = recordToSave;
    saveDatabase();
    return {
        success: true,
        key: cleanKey,
        data: recordToSave,
        message: `Registro "${cleanKey}" atualizado com sucesso no banco de dados.`
    };
}

function deleteDb(key, guildId = null, isOwner = false) {
    if (!canDelete(guildId)) {
        return {
            success: false,
            error: 'disabled',
            message: 'A exclusão no banco de dados está desativada no momento.'
        };
    }
    loadDatabase();
    const cleanKey = String(key || '').trim().toLowerCase();
    const existing = database[cleanKey];
    if (!existing) {
        return {
            success: false,
            error: 'not_found',
            message: `Registro "${cleanKey}" não encontrado para exclusão.`
        };
    }
    if (existing.protected && !isOwner) {
        return {
            success: false,
            error: 'protected',
            message: `O registro "${cleanKey}" é protegido pelo criador e não pode ser excluído.`
        };
    }
    delete database[cleanKey];
    saveDatabase();
    return {
        success: true,
        key: cleanKey,
        message: `Registro "${cleanKey}" excluído com sucesso.`
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
    readDb,
    writeDb,
    editDb,
    deleteDb,
    listDbKeys,
    setProtection
};
