export function getTrade() {
  return `
    select
      s.symbol,
      t.trade_date,
      t.trade_type,
      t.share,
      t.price,
      t.total,
      t.lot,
      '' as allocation,
      s.asset_type,
      a.account_name as account,
      inst.name as institution,
      inst.id as institution_id,
      t.id,
      t.account_id,
      t.symbol_id,
      t.note
    from trd_log t
    left join trd_account a on a.id = t.account_id
    left join trd_symbol s on s.id = t.symbol_id
    left join trd_institution inst on inst.id = a.institution_id
    where coalesce(s.active, 1) = 1
    order by t.trade_date desc, s.symbol, t.trade_type
  `;
}

export function addSymbol() {
  return 'insert into trd_symbol (symbol, company_name, asset_type) values (?, ?, ?)';
}

export function addTradeType() {
  return 'insert into trd_trade_type (name, display_name, sort_order, active) values (?, ?, ?, ?)';
}

export function addTrade() {
  return `
    insert into trd_log (
      trade_date,
      account_id,
      institution_id,
      symbol_id,
      trade_type,
      trade_type_id,
      share,
      price,
      lot,
      note
    )
    select
      ?,
      a.id,
      a.institution_id,
      ?,
      ?,
      (select id from trd_trade_type where name = ?),
      ?,
      ?,
      coalesce(
        (
          select max(lot)
          from trd_log t
          where t.account_id = a.id
        ),
        0
      ) + 1,
      null
    from trd_account a
    where a.id = ?
  `;
}

export function getAvailableBuyLots() {
  return `
    select
      b.id as buy_id,
      b.trade_date,
      b.lot,
      b.share,
      b.price,
      b.account_id,
      b.symbol_id,
      coalesce(sum(m.matched_share), 0) as matched_share,
      b.share - coalesce(sum(m.matched_share), 0) as remaining_share
    from trd_log b
    left join trd_lot_match m on m.buy_trade_id = b.id
    where b.trade_type = 'BUY'
      and b.account_id = ?
      and b.symbol_id = ?
    group by b.id, b.trade_date, b.lot, b.share, b.price, b.account_id, b.symbol_id
    having remaining_share > 0
    order by b.trade_date, b.lot
  `;
}

export function getSellMatchSummary() {
  return `
    select
      s.id as sell_id,
      s.trade_date,
      s.lot,
      s.share,
      s.price,
      coalesce(sum(m.matched_share), 0) as matched_share,
      s.share - coalesce(sum(m.matched_share), 0) as remaining_share
    from trd_log s
    left join trd_lot_match m on m.sell_trade_id = s.id
    where s.trade_type = 'SELL'
      and s.id = ?
    group by s.id, s.trade_date, s.lot, s.share, s.price
  `;
}

export function addTradeMatch() {
  return `
    insert into trd_lot_match (buy_trade_id, sell_trade_id, matched_share)
    values (?, ?, ?)
  `;
}

export function updatePrice() {
  return 'update trd_symbol set price = ?, previous_price = ? where upper(symbol) = upper(?)';
}

export function addAccount() {
  return 'insert into trd_account (institution_id, account_name) values (?, ?)';
}

export function addInstitution() {
  return 'insert into trd_institution (name, type) values (?, ?)';
}

export function getAccount() {
  return `
    select a.id, a.account_name account, i.name institute, a.institution_id
    from trd_account a
    left join trd_institution i on i.id = a.institution_id
    order by i.name, a.account_name
  `;
}

export function getAccountBalanceByDate(date: string) {
  return `
    select
      a.account_name account,
      i.name institute,
      b.date,
      b.total_balance
    from trd_account a
    left join trd_institution i on i.id = a.institution_id
    left join trd_account_balance b
      on b.account_id = a.id
      and b.date = (
        select max(bb.date)
        from trd_account_balance bb
        where bb.account_id = a.id
          and bb.date <= date(?)
      )
    order by i.name desc, a.account_name
  `;
}

export { getTable, addTable, updateTable, deleteTable } from '../../appCommon/tableQueries';
