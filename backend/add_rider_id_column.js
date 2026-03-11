const { sequelize } = require('./src/models');

async function migrate() {
    try {
        console.log('Adding columns to ChatThreads, ChatMessages, and Users...');
        try { await sequelize.query("ALTER TABLE chat_threads ADD COLUMN rider_id INTEGER REFERENCES Users(user_id);"); } catch(e){ console.log('rider_id likely exists'); }
        try { await sequelize.query("ALTER TABLE chat_threads ADD COLUMN status TEXT DEFAULT 'active';"); } catch(e){ console.log('status likely exists'); }
        try { await sequelize.query("ALTER TABLE chat_threads ADD COLUMN locked_at DATETIME;"); } catch(e){ console.log('locked_at likely exists'); }
        try { await sequelize.query("ALTER TABLE chat_threads ADD COLUMN updated_at DATETIME;"); } catch(e){ console.log('updated_at likely exists'); }
        
        try { await sequelize.query("ALTER TABLE chat_messages ADD COLUMN message_type TEXT DEFAULT 'text';"); } catch(e){ console.log('message_type likely exists'); }
        try { await sequelize.query("ALTER TABLE Users ADD COLUMN avatar_url TEXT;"); } catch(e){ console.log('avatar_url likely exists'); }
        
        console.log('Success.');
    } catch (e) {
        console.log('Error:', e.message);
    }
}

migrate();
