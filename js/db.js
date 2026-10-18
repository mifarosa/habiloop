// The app's data lives in a real SQLite database (sql.js) that uses Loop Habit Tracker's schema,
// so a Loop backup (.db) opens directly and exports back into Loop. The raw bytes are kept in IndexedDB.
const LoopDB = (() => {
  const SCHEMA_VERSION = 25;
  const IDB_NAME = "habiloop", IDB_STORE = "kv", IDB_KEY = "db";
  let SQL = null, db = null;

  const SCHEMA = `
    create table Habits (
      id integer primary key autoincrement, archived integer, color integer, description text,
      freq_den integer, freq_num integer, highlight integer, name text, position integer,
      reminder_hour integer, reminder_min integer, reminder_days integer, type integer,
      target_type integer, target_value real, unit text, question text, uuid text);
    create table Repetitions (
      id integer primary key autoincrement, habit integer not null references habits(id),
      timestamp integer not null, value integer not null, notes text);
    create unique index idx_repetitions_habit_timestamp on Repetitions(habit, timestamp);
    pragma user_version = ${SCHEMA_VERSION};`;

  const idb = () => new Promise((res, rej) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(IDB_STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function idbGet() {
    const d = await idb();
    return new Promise((res, rej) => { const q = d.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  }
  async function idbPut(bytes) {
    const d = await idb();
    return new Promise((res, rej) => { const tx = d.transaction(IDB_STORE, "readwrite"); tx.objectStore(IDB_STORE).put(bytes, IDB_KEY); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
  }

  function rows(sql, params) {
    const st = db.prepare(sql, params), out = [];
    while (st.step()) out.push(st.getAsObject());
    st.free();
    return out;
  }
  const hasTable = (d, name) => { const st = d.prepare("select 1 from sqlite_master where type='table' and lower(name)=lower(?)", [name]); const r = st.step(); st.free(); return r; };
  const columns = (d, table) => { const st = d.prepare(`pragma table_info(${table})`), c = []; while (st.step()) c.push(st.getAsObject().name.toLowerCase()); st.free(); return c; };

  async function init() {
    SQL = await initSqlJs({ locateFile: (f) => "lib/" + f });
    let bytes = null;
    try { bytes = await idbGet(); } catch (e) {}
    if (bytes) { try { db = new SQL.Database(bytes); rows("select count(*) c from Habits"); } catch (e) { db = null; } }
    if (!db) { db = new SQL.Database(); db.exec(SCHEMA); await persist(); }
  }

  const persist = () => idbPut(db.export()).catch(() => {});

  // Opens a Loop backup. Throws if the file is not a Loop database.
  async function importBytes(bytes) {
    const next = new SQL.Database(bytes);
    try {
      if (!hasTable(next, "Habits") || !hasTable(next, "Repetitions")) throw new Error("not-loop");
      const hc = columns(next, "Habits"), rc = columns(next, "Repetitions");
      for (const [col, ddl] of [["question", "text"], ["uuid", "text"], ["type", "integer"], ["target_type", "integer"], ["target_value", "real"], ["unit", "text"], ["reminder_days", "integer"], ["color", "integer"], ["archived", "integer"], ["highlight", "integer"], ["position", "integer"]])
        if (!hc.includes(col)) next.exec(`alter table Habits add column ${col} ${ddl}`);
      if (!rc.includes("notes")) next.exec("alter table Repetitions add column notes text");
      next.exec("select id, name, freq_num, freq_den from Habits; select habit, timestamp, value from Repetitions;");
    } catch (e) { next.close(); throw e; }
    db.close(); db = next;
    await persist();
  }

  const exportBytes = () => db.export();

  function habits() {
    return rows("select * from Habits order by archived, position, id");
  }
  function entries() {
    const m = new Map();
    for (const r of rows("select habit, timestamp, value from Repetitions")) {
      if (!m.has(r.habit)) m.set(r.habit, new Map());
      m.get(r.habit).set(Math.round(r.timestamp / 86400000), r.value);
    }
    return m;
  }
  function setEntry(habit, day, value) {
    db.run("delete from Repetitions where habit=? and timestamp=?", [habit, day * 86400000]);
    if (value != null) db.run("insert into Repetitions (habit, timestamp, value, notes) values (?,?,?,'')", [habit, day * 86400000, value]);
    return persist();
  }
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/-/g, ""); }
  function saveHabit(h) {
    const v = [h.name, h.question || "", h.type, h.freq_num, h.freq_den, h.target_type, h.target_value, h.unit || "", h.color];
    if (h.id) db.run("update Habits set name=?, question=?, type=?, freq_num=?, freq_den=?, target_type=?, target_value=?, unit=?, color=? where id=?", [...v, h.id]);
    else {
      const pos = rows("select coalesce(max(position),-1)+1 p from Habits")[0].p;
      db.run("insert into Habits (name, question, type, freq_num, freq_den, target_type, target_value, unit, color, archived, description, highlight, position, reminder_hour, reminder_min, reminder_days, uuid) values (?,?,?,?,?,?,?,?,?,0,'',0,?,null,null,127,?)", [...v, pos, uuid()]);
    }
    return persist();
  }
  function deleteHabit(id) {
    db.run("delete from Repetitions where habit=?", [id]);
    db.run("delete from Habits where id=?", [id]);
    return persist();
  }
  function setArchived(id, a) { db.run("update Habits set archived=? where id=?", [a ? 1 : 0, id]); return persist(); }

  return { init, importBytes, exportBytes, habits, entries, setEntry, saveHabit, deleteHabit, setArchived };
})();
