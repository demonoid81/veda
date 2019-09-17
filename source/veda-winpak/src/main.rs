#[macro_use]
extern crate log;

use chrono::{Local, NaiveDateTime};
use env_logger::Builder;
use log::LevelFilter;
use std::io::Write;
use std::{thread, time};
use v_api::*;
use v_module::module::*;
use v_onto::{individual::*, parser::*};
use v_queue::{consumer::*, record::*};
//use v_search::FTQuery;
use futures::Future;
use futures_state_stream::StateStream;
use tiberius::SqlConnection;
use tokio::runtime::current_thread;
use v_onto::datatype::Lang;

fn main() -> std::io::Result<()> {
    let env_var = "RUST_LOG";
    match std::env::var_os(env_var) {
        Some(val) => println!("use env var: {}: {:?}", env_var, val.to_str()),
        None => std::env::set_var(env_var, "info"),
    }

    Builder::new()
        .format(|buf, record| writeln!(buf, "{} [{}] - {}", Local::now().format("%Y-%m-%dT%H:%M:%S%.3f"), record.level(), record.args()))
        .filter(None, LevelFilter::Info)
        .init();

    let mut module = Module::default();

    let mut conn_str = String::default();

    let systicket;
    if let Ok(t) = module.get_sys_ticket_id() {
        systicket = t;
    } else {
        error!("fail get systicket");
        return Ok(());
    }

    //    while !ft_client.connect() {
    //        thread::sleep(time::Duration::from_millis(3000));
    //    }

    let mut queue_consumer = Consumer::new("./data/queue", "winpak", "individuals-flow").expect("!!!!!!!!! FAIL QUEUE");
    let mut total_prepared_count: u64 = 0;

    loop {
        if conn_str.is_empty() {
            let conn_str_w = get_conn_string(&mut module);
            if conn_str_w.is_err() {
                error!("fail read connection info: err={:?}", conn_str_w.err());
                error!("sleep and repeate...");
                thread::sleep(time::Duration::from_millis(10000));
                continue;
            }
            conn_str = conn_str_w.unwrap();
        }

        let mut size_batch = 0;

        // read queue current part info
        if let Err(e) = queue_consumer.queue.get_info_of_part(queue_consumer.id, true) {
            error!("{} get_info_of_part {}: {}", total_prepared_count, queue_consumer.id, e.as_str());
            continue;
        }

        if queue_consumer.queue.count_pushed - queue_consumer.count_popped == 0 {
            // if not new messages, read queue info
            queue_consumer.queue.get_info_queue();

            if queue_consumer.queue.id > queue_consumer.id {
                size_batch = 1;
            }
        } else if queue_consumer.queue.count_pushed - queue_consumer.count_popped > 0 {
            if queue_consumer.queue.id != queue_consumer.id {
                size_batch = 1;
            } else {
                size_batch = queue_consumer.queue.count_pushed - queue_consumer.count_popped;
            }
        }

        if size_batch > 0 {
            debug!("queue: batch size={}", size_batch);
        }

        for _it in 0..size_batch {
            // пробуем взять из очереди заголовок сообщения
            if !queue_consumer.pop_header() {
                break;
            }

            let mut raw = RawObj::new(vec![0; (queue_consumer.header.msg_length) as usize]);

            // заголовок взят успешно, занесем содержимое сообщения в структуру Individual
            if let Err(e) = queue_consumer.pop_body(&mut raw.data) {
                if e == ErrorQueue::FailReadTailMessage {
                    break;
                } else {
                    error!("{} get msg from queue: {}", total_prepared_count, e.as_str());
                    break;
                }
            }

            if let Err(e) = prepare_queue_element(&mut module, &systicket, &conn_str, &mut Individual::new_raw(raw)) {
                error!("fail prepare queue element, err={:?}", e);
                if e == ResultCode::ConnectError {
                    error!("sleep and repeate...");
                    thread::sleep(time::Duration::from_millis(10000));
                    conn_str.clear();
                    continue;
                }
            }

            queue_consumer.commit_and_next();

            total_prepared_count += 1;

            if total_prepared_count % 1000 == 0 {
                info!("get from queue, count: {}", total_prepared_count);
            }
        }

        thread::sleep(time::Duration::from_millis(3000));
    }
}

const CARD_NUMBER_FIELD_NAME: &str = "mnd-s:cardNumber";
const CARD_DATA_QUERY: &str = "\
SELECT [t1].[ActivationDate], [t1].[ExpirationDate],
concat([t2].[LastName],' ',[t2].[FirstName],' ',[t2].[Note1]) as Description,
[t2].[Note2] as TabNumber,
[t2].[Note17] as Birthday,
concat( [t2].[Note4]+' ',
CASE WHEN [t2].[Note6]='0' THEN null ELSE [t2].[Note6]+' ' END,
CASE WHEN [t2].[Note7]='0' THEN null ELSE [t2].[Note7]+' ' END,
CASE WHEN [t2].[Note8]='0' THEN null ELSE [t2].[Note8] END) as Comment,
concat( CASE WHEN LTRIM([t2].[Note27])='' THEN null ELSE LTRIM([t2].[Note27]+CHAR(13)+CHAR(10)) END,
CASE WHEN LTRIM([t2].[Note28])='' THEN null ELSE LTRIM([t2].[Note28]+CHAR(13)+CHAR(10)) END,
CASE WHEN LTRIM([t2].[Note29])='' THEN null ELSE LTRIM([t2].[Note29]+CHAR(13)+CHAR(10)) END,
CASE WHEN LTRIM([t2].[Note30])='' THEN null ELSE LTRIM([t2].[Note30]+CHAR(13)+CHAR(10)) END,
CASE WHEN LTRIM([t2].[Note33])='' THEN null ELSE LTRIM([t2].[Note33]+CHAR(13)+CHAR(10)) END,
CASE WHEN LTRIM([t2].[Note34])='' THEN null ELSE LTRIM([t2].[Note34]+CHAR(13)+CHAR(10)) END) as Equipment
FROM [WIN-PAK PRO].[dbo].[Card] t1
JOIN [WIN-PAK PRO].[dbo].[CardHolder] t2 ON [t2].[RecordID]=[t1].[CardHolderID]
WHERE LTRIM([t1].[CardNumber])=@P1 and [t1].[deleted]=0 and [t2].[deleted]=0 ";

const ACCESS_LEVEL_QUERY: &str = "\
SELECT [t2].[AccessLevelID]
FROM [WIN-PAK PRO].[dbo].[Card] t1
JOIN [WIN-PAK PRO].[dbo].[CardAccessLevels] t2 ON [t2].[CardID]=[t1].[RecordID]
WHERE LTRIM([t1].[CardNumber])=@P1 and [t1].[deleted]=0 and [t2].[deleted]=0";

fn update_data_from_winpak(module: &mut Module, systicket: &str, conn_str: &str, indv: &mut Individual) -> ResultCode {
    let card_number = indv.get_first_literal(CARD_NUMBER_FIELD_NAME);
    if card_number.is_err() {
        error!("fail read {} {:?}", CARD_NUMBER_FIELD_NAME, card_number.err());
        return ResultCode::UnprocessableEntity;
    }
    let param1 = card_number.unwrap_or_default();

    let mut card_data = (false, 0i64, 0i64, "".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string());
    let mut access_levels = Vec::new();

    let future = SqlConnection::connect(conn_str)
        .and_then(|conn| {
            conn.query(CARD_DATA_QUERY, &[&param1.as_str()]).for_each(|row| {
                card_data = (
                    true,
                    row.get::<_, NaiveDateTime>(0).timestamp(),
                    row.get::<_, NaiveDateTime>(1).timestamp(),
                    row.get::<_, &str>(2).to_owned(),
                    row.get::<_, &str>(3).to_owned(),
                    row.get::<_, &str>(4).to_owned(),
                    row.get::<_, &str>(5).to_owned(),
                    row.get::<_, &str>(6).to_owned(),
                );
                Ok(())
            })
        })
        .and_then(|conn| {
            conn.query(ACCESS_LEVEL_QUERY, &[&param1.as_str()]).for_each(|row| {
                access_levels.push(row.get::<_, i32>(0).to_owned());
                Ok(())
            })
        });

    if let Err(e) = current_thread::block_on_all(future) {
        error!("fail execute sql query, err={:?}", e);
        match e {
            tiberius::Error::Server(_) => {
                return ResultCode::ConnectError;
            }
            tiberius::Error::Io(_) => {
                return ResultCode::ConnectError;
            }
            _ => {}
        }
    }

    if card_data.0 {
        info!("card_data={:?}", card_data);

        indv.obj.set_datetime("v-s:dateFrom", card_data.1);
        indv.obj.set_datetime("v-s:dateTo", card_data.2);
        indv.obj.set_string("v-s:description", card_data.3.as_str(), Lang::NONE);
        indv.obj.set_string("v-s:tabNumber", card_data.4.as_str(), Lang::NONE);
        indv.obj.set_string("v-s:birthday", card_data.5.as_str(), Lang::NONE);
        indv.obj.set_string("rdfs:comment", card_data.6.as_str(), Lang::NONE);
        indv.obj.set_string("mnd-s:passEquipment", card_data.7.as_str(), Lang::NONE);

        let mut access_level_uris = Vec::new();
        for level in access_levels {
            let mut indv = Individual::default();
            if module.storage.get_individual(&("d:winpak_accesslevel_".to_string() + &level.to_string()), &mut indv) {
                if let Ok(v) = indv.get_first_literal("v-s:registrationNumber") {
                    if level.to_string() == v {
                        access_level_uris.push(indv.obj.uri);
                    }
                }
            }
        }
        indv.obj.set_uris("mnd-s:hasAccessLevel", access_level_uris);
    } else {
        error!("card [{}] not found in winpak database", param1);
        indv.obj.clear("v-s:errorMessage");
        indv.obj.add_string("v-s:errorMessage", "Карта не найдена", Lang::RU, 0);
        indv.obj.add_string("v-s:errorMessage", "Card not found", Lang::EN, 1);
    }
    indv.obj.set_uri("v-s:editor", "cfg:VedaSystem");

    let res = module.api.update(systicket, IndvOp::Put, indv);
    if res.result != ResultCode::Ok {
        error!("fail update, uri={}, result_code={:?}", indv.obj.uri, res.result);
        return ResultCode::DatabaseModifiedError;
    } else {
        info!("success update, uri={}", indv.obj.uri);
        return ResultCode::Ok;
    }
}

fn prepare_queue_element(module: &mut Module, systicket: &str, conn_str: &str, msg: &mut Individual) -> Result<(), ResultCode> {
    if let Ok(uri) = parse_raw(msg) {
        msg.obj.uri = uri;

        let wcmd = msg.get_first_integer("cmd");
        if wcmd.is_err() {
            return Err(ResultCode::UnprocessableEntity);
        }

        let cmd = IndvOp::from_i64(wcmd.unwrap_or_default());

        let new_state = msg.get_first_binobj("new_state");
        if cmd != IndvOp::Remove && new_state.is_err() {
            return Err(ResultCode::UnprocessableEntity);
        }

        let mut new_state_indv = Individual::new_raw(RawObj::new(new_state.unwrap_or_default()));
        if let Ok(uri) = parse_raw(&mut new_state_indv) {
            new_state_indv.obj.uri = uri.clone();

            if let Ok(types) = new_state_indv.get_literals("rdf:type") {
                for itype in types {
                    if itype == "mnd-s:SourceDataRequestForPass" {
                        //v-s:creator", "cfg:VedaSystem"
                        if let Ok(v) = new_state_indv.get_first_literal("v-s:editor") {
                            if v == "cfg:VedaSystem" {
                                return Ok(());
                            }
                        }

                        let res = update_data_from_winpak(module, systicket, conn_str, &mut new_state_indv);
                        if res == ResultCode::ConnectError {
                            return Err(res);
                        }
                    }
                }
            }

            // info! ("{:?}", raw);
        }
    }
    Ok(())
}

pub fn get_conn_string(module: &mut Module) -> Result<String, String> {
    let mut conn = Individual::default();
    let conn_winpak_id = "cfg:conn_winpak";
    if module.storage.get_individual(conn_winpak_id, &mut conn) {
        if let Ok(t) = conn.get_first_literal("v-s:transport") {
            if t != "mssql" {
                return Err("invalid connect type, expect [mssql]".to_owned());
            }
        }

        let host = if let Ok(v) = conn.get_first_literal("v-s:host") {
            v
        } else {
            return Err(("not found param [v-s:host] in ".to_string() + conn_winpak_id).to_owned());
        };

        let port = if let Ok(v) = conn.get_first_integer("v-s:port") {
            v
        } else {
            return Err(("not found param [v-s:port] in ".to_string() + conn_winpak_id).to_owned());
        };

        let login = if let Ok(v) = conn.get_first_literal("v-s:login") {
            v.replace("\\\\", "\\")
        } else {
            return Err(("not found param [v-s:login] in ".to_string() + conn_winpak_id).to_owned());
        };

        let pass = if let Ok(v) = conn.get_first_literal("v-s:password") {
            v
        } else {
            return Err(("not found param [v-s:password] in ".to_string() + conn_winpak_id).to_owned());
        };

        let database = if let Ok(v) = conn.get_first_literal("v-s:sql_database") {
            v
        } else {
            return Err(("not found param [v-s:sql_database] in ".to_string() + conn_winpak_id).to_owned());
        };

        Ok(format!("server=tcp:{},{};integratedsecurity=true;database={};user={};password={}", host, port, database, login, pass))
    } else {
        return Err("not found [".to_owned() + conn_winpak_id + "]");
    }
}
