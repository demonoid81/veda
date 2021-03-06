#[macro_use]
extern crate log;

mod index_workplace;
mod indexer;

use crate::indexer::{Indexer, BATCH_SIZE_OF_TRANSACTION};
use std::process;
use std::time::Instant;
use v_ft_xapian::init_db_path;
use v_ft_xapian::xapian_reader::XapianReader;
use v_module::common::load_onto;
use v_module::info::ModuleInfo;
use v_module::module::*;
use v_module::v_onto::individual::*;
use v_module::v_onto::onto::Onto;
use v_queue::consumer::*;
use xapian_rusty::*;

const BASE_PATH: &str = "./data";
const TIMEOUT_BETWEEN_COMMITS: u128 = 100;

fn main() -> Result<(), XError> {
    init_log("FT_INDEXER");
    let mut batch_size = 0;
    loop {
        let mut module = Module::default();
        if batch_size == 0 {
            batch_size = module.max_batch_size.unwrap_or_default();
        }
        if batch_size == 0 {
            batch_size = BATCH_SIZE_OF_TRANSACTION as u32;
        }

        info!("BATCH_SIZE = {}", batch_size);

        module.max_batch_size = Some(batch_size);
        if let Err(e) = index(&mut module) {
            error!("indexer, err={:?}", e);
        }

        batch_size = batch_size / 2;

        if batch_size < 1 {
            break;
        }
    }
    Ok(())
}

fn index(module: &mut Module) -> Result<(), XError> {
    if get_info_of_module("input-onto").unwrap_or((0, 0)).0 == 0 {
        wait_module("input-onto", wait_load_ontology());
    }

    let mut queue_consumer = Consumer::new(&format!("./{}/queue", BASE_PATH), "fulltext_indexer0", "individuals-flow").expect("!!!!!!!!! FAIL QUEUE");
    let module_info = ModuleInfo::new(BASE_PATH, "fulltext_indexer", true);
    if module_info.is_err() {
        error!("{:?}", module_info.err());
        process::exit(101);
    }
    let mut onto = Onto::default();
    load_onto(&mut module.storage, &mut onto);

    if let Some(xr) = XapianReader::new("russian", &mut module.storage) {
        let mut ctx = Indexer {
            onto,
            index_dbs: Default::default(),
            tg: TermGenerator::new()?,
            lang: "russian".to_string(),
            key2slot: Default::default(),
            db2path: init_db_path(),
            idx_schema: Default::default(),
            use_db: "".to_string(),
            committed_op_id: 0,
            prepared_op_id: 0,
            committed_time: Instant::now(),
            xr,
        };

        info!("Rusty search-index: start listening to queue");

        if let Err(e) = ctx.init("") {
            match e {
                XError::Xapian(c) => {
                    error!("fail init index base, err={}", get_xapian_err_type(c));
                }
                _ => {
                    error!("fail init index base, err={:?}", e);
                }
            }
            return Err(e);
        }

        module.listen_queue(
            &mut queue_consumer,
            &mut module_info.unwrap(),
            &mut ctx,
            &mut (before as fn(&mut Module, &mut Indexer, u32) -> Option<u32>),
            &mut (process as fn(&mut Module, &mut ModuleInfo, &mut Indexer, &mut Individual, my_consumer: &Consumer) -> Result<bool, PrepareError>),
            &mut (after as fn(&mut Module, &mut ModuleInfo, &mut Indexer, u32) -> Result<bool, PrepareError>),
            &mut (heartbeat as fn(&mut Module, &mut ModuleInfo, &mut Indexer) -> Result<(), PrepareError>),
        );
    } else {
        error!("fail init ft-query");
    }

    Ok(())
}

fn heartbeat(_module: &mut Module, module_info: &mut ModuleInfo, ctx: &mut Indexer) -> Result<(), PrepareError> {
    if ctx.committed_time.elapsed().as_millis() > TIMEOUT_BETWEEN_COMMITS {
        if let Err(e) = ctx.commit_all_db(module_info) {
            error!("fail commit, err={:?}", e);
            return Err(PrepareError::Fatal);
        }
    }
    Ok(())
}

fn before(_module: &mut Module, _ctx: &mut Indexer, _batch_size: u32) -> Option<u32> {
    None
}

fn after(_module: &mut Module, module_info: &mut ModuleInfo, ctx: &mut Indexer, _processed_batch_size: u32) -> Result<bool, PrepareError> {
    if let Err(e) = ctx.commit_all_db(module_info) {
        error!("fail commit, err={:?}", e);
        return Err(PrepareError::Fatal);
    }
    Ok(true)
}

fn process(module: &mut Module, module_info: &mut ModuleInfo, ctx: &mut Indexer, queue_element: &mut Individual, _my_consumer: &Consumer) -> Result<bool, PrepareError> {
    let cmd = get_cmd(queue_element);
    if cmd.is_none() {
        error!("cmd is none");
        return Ok(true);
    }

    let op_id = queue_element.get_first_integer("op_id").unwrap_or_default();

    let mut prev_state = Individual::default();
    get_inner_binobj_as_individual(queue_element, "prev_state", &mut prev_state);

    let mut new_state = Individual::default();
    get_inner_binobj_as_individual(queue_element, "new_state", &mut new_state);

    if let Err(e) = ctx.index_msg(&mut new_state, &mut prev_state, cmd.unwrap(), op_id, module, module_info) {
        error!("fail index msg, err={:?}", e);
    }

    Ok(false)
}
