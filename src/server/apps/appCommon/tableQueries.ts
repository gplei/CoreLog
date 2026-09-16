export function getTable(table: string) {
  return `select * from ${table}`;
}

export function addTable(table: string) {
  return `insert into ${table} (id) values (null)`;
}

export function updateTable(table: string, column: string) {
  return `update ${table} set ${column} = ? where id = ?`;
}

export function deleteTable(table: string) {
  return `delete from ${table} where id = ?`;
}
