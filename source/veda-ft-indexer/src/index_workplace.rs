use crate::error::Result;
use crate::indexer::to_lower_and_replace_delimeters;
use crate::Indexer;
use chrono::{TimeZone, Utc};
use v_onto::resource::Resource;
use xapian_rusty::Document;

pub struct IndexDocWorkplace {
    pub(crate) doc: Document,
    pub(crate) all_text: String,
}

impl IndexDocWorkplace {
    pub(crate) fn new(doc: Document) -> Self {
        IndexDocWorkplace {
            doc,
            all_text: "".to_string(),
        }
    }

    pub(crate) fn index_double(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let l_data = oo.get_float();
        self.doc.add_double(slot_l1, l_data)?;

        let prefix = format!("X{}D", slot_l1);
        indexer.tg.index_double(l_data, &prefix)?;

        Ok(())
    }

    pub(crate) fn index_boolean(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let l_data = oo.get_bool();

        let prefix = format!("X{}D", slot_l1);

        if l_data {
            indexer.tg.index_text_with_prefix("T", &prefix)?;
            self.doc.add_string(slot_l1, "T")?;
        } else {
            indexer.tg.index_text_with_prefix("F", &prefix)?;
            self.doc.add_string(slot_l1, "F")?;
        }
        Ok(())
    }

    pub(crate) fn index_integer(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let l_data = oo.get_int() as i32;
        self.doc.add_int(slot_l1, l_data)?;

        let prefix = format!("X{}D", slot_l1);
        indexer.tg.index_int(l_data, &prefix)?;

        Ok(())
    }

    pub(crate) fn index_date(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let l_data = oo.get_datetime();
        let data = Utc.timestamp(l_data, 0).to_string();
        self.doc.add_string(slot_l1, &data)?;

        let prefix = format!("X{}D", slot_l1);
        indexer.tg.index_text_with_prefix(&data, &prefix)?;

        Ok(())
    }

    pub(crate) fn index_uri(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let data = to_lower_and_replace_delimeters(oo.get_str());

        let prefix = format!("X{}X", slot_l1);
        indexer.tg.index_text_with_prefix(&data, &prefix)?;

        self.all_text.push_str(&data);
        self.all_text.push('|');

        Ok(())
    }

    pub(crate) fn index_string(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(predicate);

        let data = oo.get_str();

        let prefix = format!("X{}X", slot_l1);
        indexer.tg.index_text_with_prefix(data, &prefix)?;
        self.doc.add_string(slot_l1, data)?;

        self.all_text.push_str(&data);
        self.all_text.push('|');

        Ok(())
    }

    pub(crate) fn index_string_for_first_wildcard(&mut self, indexer: &mut Indexer, predicate: &str, oo: &Resource) -> Result<()> {
        let slot_l1 = indexer.key2slot.get_slot_and_set_if_not_found(&(predicate.to_owned() + "#F"));

        let data: String = oo.get_str().chars().rev().collect();

        let prefix = format!("X{}X", slot_l1);
        indexer.tg.index_text_with_prefix(&data, &prefix)?;

        Ok(())
    }

    pub(crate) fn doc_add_text_value(&mut self, l_slot: u32, data: &str) -> Result<()> {
        if data.chars().count() > 16 {
            let end_pos = data.char_indices().nth(16).map(|(n, _)| n).unwrap_or(0);
            let substr = &data[..end_pos];
            self.doc.add_string(l_slot, substr)?;
        } else {
            self.doc.add_string(l_slot, &data)?;
        }
        Ok(())
    }
}