"use strict";

/*
 *   обработка формы решения пользователя
 */
function prepare_decision_form(ticket, document)
{
    if (document['v-wf:isCompleted'] && document['v-wf:isCompleted'][0].data == true)
        return;

    //print("[WORKFLOW][DF1].0");
    var takenDecision = document['v-wf:takenDecision'];
    if (!takenDecision)
        return;

    //print("[WORKFLOW][DF1] : ### ---------------------------- prepare_decision_form:" + document['@']);

    var onWorkOrder = document['v-wf:onWorkOrder'];
    var work_order = get_individual(ticket, getUri(onWorkOrder));
    if (!work_order) return;

    //print("[WORKFLOW][DF1].1");

    var forWorkItem_uri = getUri(work_order['v-wf:forWorkItem']);
    var work_item = get_individual(ticket, forWorkItem_uri);
    if (!work_item) return;

    //print("[WORKFLOW][DF1].2");

    var forNetElement = work_item['v-wf:forNetElement'];
    var netElement = get_individual(ticket, getUri(forNetElement));
    if (!netElement) return;

    //print("[WORKFLOW][DF1].3");

    var transform_link = getUri(netElement['v-wf:completeResultTransform']);
    if (!transform_link) return;
    var transform = get_individual(ticket, transform_link);
    if (!transform) return;

    //print("[WORKFLOW][DF1].4 document=", toJson(document));
    //print("[WORKFLOW][DF1].4 transform=", toJson(transform));
    //print("[WORKFLOW][DF1].4 work_order=", toJson(work_order));

    var process_output_vars = transformation(ticket, document, transform, null, onWorkOrder);

    //print("[WORKFLOW][DF1].5 transform_result=", toJson(process_output_vars));
    var new_vars = [];
    for (var i = 0; i < process_output_vars.length; i++)
    {
        put_individual(ticket, process_output_vars[i], _event_id);
        new_vars.push(
        {
            data: process_output_vars[i]['@'],
            type: _Uri
        });
    }
    if (process_output_vars.length > 0)
    {
        work_order['v-wf:outVars'] = new_vars;
        put_individual(ticket, work_order, _event_id);

        document['v-wf:isCompleted'] = [
            {
                data: true,
                type: _Bool
                 }];

        put_individual(ticket, document, _event_id);
    }
}


/*
 *   обработка рабочего задания
 */
function prepare_work_order(ticket, document)
{
    print("[WORKFLOW][WO1] : ### ---------------------------- prepare_work_order:" + document['@']);
    var f_executor = document['v-wf:executor'];
    var executor = get_individual(ticket, getUri(f_executor));
    //if (!executor) return;

    var forWorkItem_uri = getUri(document['v-wf:forWorkItem']);
    var work_item = get_individual(ticket, forWorkItem_uri);
    if (!work_item) return;

    var f_inVars = work_item['v-wf:inVars'];

    var forProcess_uri = getUri(work_item['v-wf:forProcess']);
    var _process = get_individual(ticket, forProcess_uri);
    if (!_process) return;

    var process_inVars_uri = _process['v-wf:inVars'];

    var forNetElement = work_item['v-wf:forNetElement'];
    var netElement = get_individual(ticket, getUri(forNetElement));
    if (!netElement) return;

    var local_outVars = document['v-wf:outVars'];
	var task_output_vars = [];

    // берем только необработанные рабочие задания
    if (!local_outVars)
    {
        // если исполнитель коделет
        if (!executor)
        {
            if (!netElement['v-wf:completedMapping'])
            {
                //print("[WORKFLOW][WO W6] v-wf:completedMapping not defined=", netElement['@']);
                task_output_vars.push(
                {
                    data: 'v-wf:complete',
                    type: _Uri
                });
            }
            else
            {
                // сохраняем результаты в v-wf:outVars в обрабатываемом рабочем задании
                task_output_vars = create_and_mapping_variables(ticket, netElement['v-wf:completedMapping'], _process, work_item, null);
                print("[WORKFLOW][WO W2] task_output_vars=", toJson(task_output_vars));
            }

            if (task_output_vars.length > 0)
            {
                document['v-wf:outVars'] = task_output_vars;
                put_individual(ticket, document, _event_id);
            }

        }
        else if (is_exist(executor, 'rdf:type', 'v-s:Codelet'))
        {
            print("[WORKFLOW][WO2] executor=" + getUri(f_executor) + ", is codelet");

            var expression = getFirstValue(executor['v-s:script']);
            if (!expression) return;

            print("[WORKFLOW][WO3] expression=" + expression);

            var task = new Context(work_item, ticket);
            var process = new Context(_process, ticket);
            var result0 = eval(expression);

            print("[WORKFLOW][WO4] task: eval result=", toJson(result0));

            if (!netElement['v-wf:completedMapping'])
            {
                //print("[WORKFLOW][WO W6] v-wf:completedMapping not defined=", netElement['@']);
                task_output_vars.push(
                {
                    data: 'v-wf:complete',
                    type: _Uri
                });
            }
            else
            {
                // сохраняем результаты в v-wf:outVars в обрабатываемом рабочем задании
                task_output_vars = create_and_mapping_variables(ticket, netElement['v-wf:completedMapping'], _process, work_item, result0);
                print("[WORKFLOW][WO W6.1] task_output_vars=", toJson(task_output_vars));
            }

            if (task_output_vars.length > 0)
            {
                document['v-wf:outVars'] = task_output_vars;
                put_individual(ticket, document, _event_id);
            }


        } // end [is codelet]        
        else if (is_exist(executor, 'rdf:type', 'v-s:Appointment'))
        {
            print("[WORKFLOW][WO20] is USER, executor=" + getUri(f_executor) + "");
            //            print("work_item.inVars=", toJson(f_inVars));
            //            print("process.inVars=", toJson(process_inVars_uri));

            var work_item_inVars = [];
            for (var i = 0; i < f_inVars.length; i++)
            {
                var indv = get_individual(ticket, f_inVars[i].data);
                work_item_inVars.push(indv);
            }

            var prev_task;
            var i_work_item = work_item;

            while (!prev_task)
            {
                var previousWorkItem_uri = getUri(i_work_item['v-wf:previousWorkItem']);
                if (!previousWorkItem_uri)
                    break;

                var previous_work_item = get_individual(ticket, previousWorkItem_uri);
                if (!previous_work_item)
                    break;

                var prev_forNetElement_uri = getUri(previous_work_item['v-wf:forNetElement']);
                if (!prev_forNetElement_uri)
                    break;

                var prev_forNetElement = get_individual(ticket, prev_forNetElement_uri);
                if (!prev_forNetElement)
                    break;

                if (prev_forNetElement['rdf:type'][0].data == 'v-wf:Task')
                {
                    prev_task = previous_work_item['v-wf:forNetElement'];
                    break;
                }
                i_work_item = previous_work_item;
            }

            // ? или сделать curTask и prevTask только для трансформации ?
            // ++ work_item_inVars: cur task id
            var var_ctid = {
                '@': '-',
                'rdf:type': [
                    {
                        data: 'v-wf:Variable',
                        type: _Uri
                      }],
                'v-wf:variableName': [
                    {
                        data: "curTask",
                        type: _String
                      }],
                'v-wf:variableValue': forNetElement
            };
            work_item_inVars.push(var_ctid);

            if (prev_task)
            {
                // ++ work_item_inVars: prev task id
                var_ctid = {
                    '@': '-',
                    'rdf:type': [
                        {
                            data: 'v-wf:Variable',
                            type: _Uri
                      }],
                    'v-wf:variableName': [
                        {
                            data: "prevTask",
                            type: _String
                      }],
                    'v-wf:variableValue': prev_task
                };
                work_item_inVars.push(var_ctid);
            }

            print("[WORKFLOW][WO20.0] transform_link=" + toJson(netElement['v-wf:startResultTransform']));
            print("[WORKFLOW][WO20.1] work_item_inVars=" + toJson(work_item_inVars));


            var transform_link = getUri(netElement['v-wf:startResultTransform']);
            if (!transform_link) return;
            var transform = get_individual(ticket, transform_link);
            if (!transform) return;

            var transform_result = transformation(ticket, work_item_inVars, transform, f_executor, newUri(document['@']));

            for (var i = 0; i < transform_result.length; i++)
            {
                put_individual(ticket, transform_result[i], _event_id);
                // выдадим права отвечающему на эту форму
                var employee = executor['v-s:employee'];
                if (employee)
                {
                    print("[WORKFLOW][WO20.3] employee=" + toJson(employee));

                    addRight(ticket, [can_read, can_update], employee[0].data, transform_result[i]['@']);
                }
            }

            print("[WORKFLOW][WO20.2] transform_result=" + toJson(transform_result));
        }
        else if (is_exist(executor, 'rdf:type', 'v-wf:Net'))
        {
            print("[WORKFLOW][WO21] executor is Net :" + getUri(f_executor) + "");

            //var ctx = new Context(work_item, ticket);
            //ctx.print_variables ('v-wf:inVars');
            var _started_net = get_individual(ticket, getUri(f_executor));

            if (_started_net)
            {
                var new_process_uri = guid();

                var new_process = {
                    '@': new_process_uri,
                    'rdf:type': [
                        {
                            data: 'v-wf:Process',
                            type: _Uri
       }],
                    'v-wf:instanceOf': f_executor,
                    'v-wf:parentWorkOrder': [
                        {
                            data: document['@'],
                            type: _Uri
       }]
                };

                new_process['rdfs:label'] = [
                    {
                        data: "экземпляр маршрута :" + getFirstValue(_started_net['rdfs:label']) + ", запущен из " + getFirstValue(netElement['rdfs:label']),
                        type: _String
                  }];

                // возьмем входные переменные WorkItem	и добавим их процессу
                if (f_inVars)
                    new_process['v-wf:inVars'] = f_inVars;

                //print("new_process=", toJson(new_process));
                put_individual(ticket, new_process, _event_id);
            }
        }
        else
        {
            print("[WORKFLOW][WO22] executor not defined :" + getUri(f_executor) + "");
        }
    }

    var is_goto_to_next_task = false;

    // begin //////////////// скрипт сборки результатов (WorkOrder) ///////////////////////////////////////////
    var result = [];

    // найдем маппинг множественных результатов
    //var wosResultsMapping = netElement['v-wf:wosResultsMapping'];

    var workOrderList = work_item['v-wf:workOrderList'];
    // проверяем есть ли результаты рабочих заданий
    for (var i = 0; i < workOrderList.length; i++)
    {
        print("[WORKFLOW][WO30.0] workOrder=" + toJson(workOrderList[i]) + "");
        var workOrder;
        if (workOrderList[i].data != document['@'])
            workOrder = get_individual(ticket, workOrderList[i].data);
        else
            workOrder = document;

        print("[WORKFLOW][WO30.1] workOrder=" + toJson(workOrder) + "");

        var outVars = workOrder['v-wf:outVars'];
        if (outVars)
        {
            var _result = get_individual(ticket, outVars[0].data);
            print("[WORKFLOW][WO30.2] _result=" + toJson(_result) + "");
            if (_result)
            {
                //if (wosResultsMapping)
                //{
                // wosResultsMapping указан 
                //}
                //else
                {
                    // складываем все результаты в локальную переменную					
                    var el = {};
                    el['workOrder'] = workOrder['@'];
                    var key, val;
                    var varName = _result["v-wf:variableName"];
                    if (varName)
                        key = varName[0].data;

                    var varValue = _result["v-wf:variableValue"];
                    if (varValue)
                        val = varValue[0].data;

                    if (val !== undefined && key !== undefined)
                    {
                        el[key] = val;

                        result.push(el);
                    }
                    print("[WORKFLOW][WO30.3] result=" + toJson(result) + "");
                }
            }
        }

    }
    print("[WORKFLOW][WO1-20]");

    if (result.length == workOrderList.length)
        is_goto_to_next_task = true;
    else
        print("[WORKFLOW][WO1-25] не все задания выполнены, stop.");

    // end //////////////// скрипт сборки результатов
    print("[WORKFLOW][WO2] result=" + toJson(result) + "");

    var workItemList = [];

    if (is_goto_to_next_task)
    {
        if (netElement['v-wf:completedMapping'])
        {
            // сохраняем результаты в v-wf:outVars в обрабатываемом рабочем задании
            task_output_vars = create_and_mapping_variables(ticket, netElement['v-wf:completedMapping'], _process, work_item, result);
            print("[WORKFLOW][WO W2] task_output_vars=", toJson(task_output_vars));
        }

        if (task_output_vars.length > 0)
        {
            document['v-wf:outVars'] = task_output_vars;
            put_individual(ticket, document, _event_id);
        }


        // определим переход на следующие задачи в зависимости от результата
        // res должен быть использован при eval каждого из предикатов
        var hasFlows = netElement['v-wf:hasFlow'];
        if (hasFlows)
        {
            var split = getUri(netElement['v-wf:split']);

            //if (split)
            //{

            for (var i = 0; i < hasFlows.length; i++)
            {
                var flow = get_individual(ticket, hasFlows[i].data);
                if (!flow) continue;

                //print("[WORKFLOW][WO6]:Flow: " + flow['@']);

                var flowsInto = flow['v-wf:flowsInto'];
                if (!flowsInto) continue;

                var predicate = flow['v-wf:predicate'];
                if (predicate)
                {
                    //print("[WORKFLOW][WO7] eval res=" + toJson(res));

                    //print("[WORKFLOW][WO8] predicate=" + toJson(predicate));
                    expression = getFirstValue(predicate);
                    //print("[WORKFLOW][WO9] expression=" + toJson(expression));
                    //print("[WORKFLOW][WO9.1] result=" + toJson(result));
                    if (expression)
                    {
                        var res1 = eval(expression);
                        //print("res1=" + res1);
                        if (res1 === true && split == 'v-wf:XOR')
                        {
                            // выполним переход по XOR условию								
                            var nextNetElement = get_individual(ticket, getUri(flowsInto));

                            if (nextNetElement)
                            {
                                //print("[WORKFLOW][WO10] create next work item for =" + nextNetElement['@']);
                                var work_item_uri = create_work_item(ticket, forProcess_uri, nextNetElement['@'], work_item['@'], _event_id);
                                workItemList.push(
                                {
                                    data: work_item_uri,
                                    type: _Uri
                                });
                            }

                        }
                    }
                }
                else
                {
                    // условия нет, выполним переход								
                    var nextNetElement = get_individual(ticket, getUri(flowsInto));

                    if (nextNetElement)
                    {
                        //print("[WORKFLOW][WO11] create next work item for =" + nextNetElement['@']);
                        var work_item_uri = create_work_item(ticket, forProcess_uri, nextNetElement['@'], work_item['@'], _event_id);
                        workItemList.push(
                        {
                            data: work_item_uri,
                            type: _Uri
                        });
                    }


                }

            }
            // }
        }

        work_item['v-wf:isCompleted'] = [
            {
                data: true,
                type: _Bool
                 }];

        if (workItemList.length > 0)
            work_item['v-wf:workItemList'] = workItemList;

        put_individual(ticket, work_item, _event_id);
        print("[WORKFLOW][WO12] document=", toJson(document));
    }

}

/*
 *   обработка элемента сети
 * 
 * 			1. вычисление количества исполнителей, подготовка для них данных, запуск.
 * 			2. обработка результатов, ветвление 
 */
function prepare_work_item(ticket, document)
{
    var work_item = document;
    print("[WORKFLOW]:prepare_work_item ### --------------------------------- " + document['@']);

    var isCompleted = document['v-wf:isCompleted'];

    if (isCompleted)
    {
        if (isCompleted[0].data === true)
        {
            print("[WORKFLOW]:prepare_work_item, completed, exit");
            return;
        }
    }

    var forProcess = getUri(document['v-wf:forProcess']);
    var _process = get_individual(ticket, forProcess);
    if (!_process) return;

    var instanceOf = getUri(_process['v-wf:instanceOf']);
    var _net = get_individual(ticket, instanceOf);
    if (!_net) return;

    //print("[WORKFLOW]:Process=" + _process['@'] + ", net=" + _net['@']);

    var forNetElement = document['v-wf:forNetElement'];
    var netElement = get_individual(ticket, getUri(forNetElement));
    if (!netElement) return;

    print("\r\n[WORKFLOW]:-- NetElement:" + netElement['@'] + ' --');

    var is_completed = false;
    var workItemList = [];

    var is_goto_to_next_task = false;
    var task_output_vars = [];

    if (is_exist(netElement, 'rdf:type', 'v-wf:Task'))
    {
        //print("[WORKFLOW]:Is task");

        // выполнить маппинг переменных	
        print("[WORKFLOW][PWI1] task: start mapping vars");
        var work_item__inVars = [];
        if (netElement['v-wf:startingMapping'])
        {
            work_item__inVars = create_and_mapping_variables(ticket, netElement['v-wf:startingMapping'], _process, document, null);
            if (work_item__inVars.length > 0)
                document['v-wf:inVars'] = work_item__inVars;

            //var ctx = new Context(document, ticket);
            //ctx.print_variables('v-wf:inVars');
        }

        //print("work_item__inVars=", toJson(work_item__inVars));
        // сформировать список исполнителей
        var executor_list = [];
        var executor_uris = netElement['v-wf:executor'];

        if (executor_uris)
        {
            for (var i = 0; i < executor_uris.length; i++)
            {
                var executor = get_individual(ticket, executor_uris[i].data);

                if (is_exist(executor, 'rdf:type', 'v-wf:ExecutorDefinition'))
                {
                    // определение исполнителей посредством скрипта
                    //print("[WORKFLOW] executor=" + executor_uris[i].data + ", script defined");

                    var expression = getFirstValue(executor['v-s:script']);
                    if (!expression) return;

                    //print("[WORKFLOW] expression=" + expression);

                    var task = new Context(document, ticket);
                    //            var net = new Context(_net, ticket);
                    var process = new Context(_process, ticket);
                    //var context = task;

                    var result = eval(expression);

                    //print("[WORKFLOW] task: result of v-wf:ExecutorDefinition=", toJson(result));

                    if (result.length > 0)
                    {
                        for (var i3 = 0; i3 < result.length; i3++)
                        {
                            executor_list.push(result[i3]);
                        }
                    }
                }
                else
                {
                    executor_list.push(executor_uris[i]);
                }
            }
        }
        else
        {
            var subNet_uri = netElement['v-wf:subNet'];
            if (subNet_uri)
                executor_list.push(subNet_uri[0]);
        }

        if (executor_list.length == 0)
            executor_list.push(null);

        print("[WORKFLOW] executor list =" + toJson(executor_list));

        var work_order_list = [];
        var work_order_uri_list = [];

        // сформировать задания для исполнителей
        for (var i = 0; i < executor_list.length; i++)
        {
            var new_work_order_uri = guid();

            var new_work_order = {
                '@': new_work_order_uri,
                'rdf:type': [
                    {
                        data: 'v-wf:WorkOrder',
                        type: _Uri
       }],
                'v-wf:forWorkItem': [
                    {
                        data: document['@'],
                        type: _Uri
       }],
            };

            if (executor_list[i] != null)
                new_work_order['v-wf:executor'] = executor_list[i];

            work_order_list.push(new_work_order);
            work_order_uri_list.push(
            {
                data: new_work_order_uri,
                type: _Uri
            });
        }

        if (work_order_uri_list.length > 0)
            document['v-wf:workOrderList'] = work_order_uri_list;

        if (work_item__inVars > 0 || work_order_uri_list.length > 0)
            put_individual(ticket, document, _event_id);

        for (var i = 0; i < work_order_list.length; i++)
        {
            put_individual(ticket, work_order_list[i], _event_id);
        }

    } // end [Task]
    else if (is_exist(netElement, 'rdf:type', 'v-wf:InputCondition') || is_exist(netElement, 'rdf:type', 'v-wf:Condition'))
    {
        is_goto_to_next_task = true;
    } // end [InputCondition]
    else if (is_exist(netElement, 'rdf:type', 'v-wf:OutputCondition'))
    {
        print("[WORKFLOW][PWI]:Is output condition");
        //var process = new Context(_process, ticket);
        //process.print_variables('v-wf:inVars');
        //process.print_variables('v-wf:outVars');

        var f_parent_work_order = _process['v-wf:parentWorkOrder'];
        if (f_parent_work_order)
        {
            var parent_work_order = get_individual(ticket, getUri(f_parent_work_order));
            if (parent_work_order)
            {
                if (!_net['v-wf:completedMapping'])
                {
                    print("[WORKFLOW][PWI] #6");
                    task_output_vars.push(
                    {
                        data: 'v-wf:complete',
                        type: _Uri
                    });
                }
                else
                {
                    print("[WORKFLOW][PWI] #7");
                    // сохраняем результаты в v-wf:outVars в обрабатываемом рабочем задании
                    task_output_vars = create_and_mapping_variables(ticket, _net['v-wf:completedMapping'], _process, work_item, null);
                }

                if (task_output_vars.length > 0)
                {
                    print("[WORKFLOW][PWI] #8");
                    parent_work_order['v-wf:outVars'] = task_output_vars;
                    put_individual(ticket, parent_work_order, _event_id);
                }

            }
        }


        document['v-wf:isCompleted'] = [
            {
                data: true,
                type: _Bool
       }];

        is_completed = true;

    } // end [OutputCondition]    

    if (is_goto_to_next_task == true)
    {
        //print("[WORKFLOW]:Is inputCondition or Condition");
        var hasFlows = netElement['v-wf:hasFlow'];
        if (hasFlows)
        {
            for (var i = 0; i < hasFlows.length; i++)
            {
                var flow = get_individual(ticket, hasFlows[i].data);
                if (!flow) continue;

                //print("[WORKFLOW]:Flow: " + flow['@']);

                var flowsInto = flow['v-wf:flowsInto'];
                if (!flowsInto) continue;

                var nextNetElement = get_individual(ticket, getUri(flowsInto));
                if (!nextNetElement) continue;

                var work_item_uri = create_work_item(ticket, forProcess, nextNetElement['@'], document['@'], _event_id);
                workItemList.push(
                {
                    data: work_item_uri,
                    type: _Uri
                });
                document['v-wf:isCompleted'] = [
                    {
                        data: true,
                        type: _Bool
                 }];
                is_completed = true;

                //print("[WORKFLOW][WO12] document=", toJson(document));
            }
        }
    }

    if (workItemList.length > 0)
        document['v-wf:workItemList'] = workItemList;

    if (is_completed == true || workItemList.length > 0)
    {
        put_individual(ticket, document, _event_id);
    }

}

/*
 *  обработка процесса
 */
function prepare_process(ticket, document)
{
    var _process = document;

    print("[WORKFLOW][PP01] prepare_process:" + document['@']);
    var inVars = _process['v-wf:inVars'];
    if (!inVars)
        inVars = [];

    print("[WORKFLOW][PP02]");
    var instanceOf = document['v-wf:instanceOf'];
    var net = get_individual(ticket, getUri(instanceOf));
    if (!net) return;

    print("[WORKFLOW][PP03]");
    // создадим переменные с областью видимости данного процесса (v-wf:varDefineScope = v-wf:Net)
    var variables = net['v-wf:localVariable'];
    if (variables)
    {
        for (var i = 0; i < variables.length; i++)
        {
            var def_variable = get_individual(ticket, variables[i].data);
            if (!def_variable) continue;

            var variable_scope = getUri(def_variable['v-wf:varDefineScope']);
            if (!variable_scope) continue;

            if (variable_scope == 'v-wf:Net')
            {
                var new_variable = generate_variable(ticket, def_variable, null, document, null, null);
                if (new_variable)
                {
                    put_individual(ticket, new_variable, _event_id);
                    inVars.push(
                    {
                        data: new_variable['@'],
                        type: _Uri
                    });
                }
            }

        }
    }
    print("[WORKFLOW][PP04]");

    var workItemList = [];

    var net_consistsOfz = net['v-wf:consistsOf'];
    if (net_consistsOfz)
    {
        print("[WORKFLOW][PP05.0]");
        for (var i = 0; i < net_consistsOfz.length; i++)
        {
            var net_consistsOf = get_individual(ticket, net_consistsOfz[i].data);
            if (!net_consistsOf) continue;

            print("[WORKFLOW][PP05.1] net_consistsOf=", toJson(net_consistsOf));

            if (is_exist(net_consistsOf, 'rdf:type', 'v-wf:InputCondition'))
            {
                var work_item_uri = create_work_item(ticket, document['@'], net_consistsOf['@'], null, _event_id);

                print("[WORKFLOW][PP05.2]");

                workItemList.push(
                {
                    data: work_item_uri,
                    type: _Uri
                });

                break;
            }
        }

    }

    if (inVars.length > 0)
        document['v-wf:inVars'] = inVars;

    //var process = new Context(_process, ticket);
    //process.print_variables('v-wf:inVars');

    if (workItemList.length > 0)
        document['v-wf:workItemList'] = workItemList;

    if (inVars.length > 0 || workItemList.length > 0)
        put_individual(ticket, document, _event_id);

    print("[WORKFLOW][PP0E]");
}

/*
 *  Обработка стартовой формы и создание экземпляра процесса.
 *  Условие запуска процесса: в стартовой форме не должно быть поля v-wf:isProcess.
 *  создается экземпляр v-wf:Process с заполненными переменными из текущей формы
 *  и экземпляр v-wf:WorkItem относящийся к v-wf:InputCondition
 */
function prepare_start_form(ticket, document)
{
    //print("[WORKFLOW]:prepare_start_form #B, doc_id=" + document['@']);

    if (document['v-wf:isProcess'])
    {
        //print("[WORKFLOW]:prepare_start_form, already started.");
        return;
    }

    var new_process_uri = guid();

    var forNet = document['v-wf:forNet'];
    var _net = get_individual(ticket, getUri(forNet));
    if (!_net) return;

    var transform_link = getUri(document['v-wf:useTransformation']);
    if (!transform_link) return;

    var transform = get_individual(ticket, transform_link);
    if (!transform) return;

    // формируем входящие переменные для нового процесса
    var process_inVars = transformation(ticket, document, transform, null, null);
    var new_vars = [];
    for (var i = 0; i < process_inVars.length; i++)
    {
        put_individual(ticket, process_inVars[i], _event_id);
        new_vars.push(
        {
            data: process_inVars[i]['@'],
            type: _Uri
        });
    }

    var new_process = {
        '@': new_process_uri,
        'rdf:type': [
            {
                data: 'v-wf:Process',
                type: _Uri
          }],
        'v-wf:instanceOf': forNet
    };
    new_process['rdfs:label'] = [
        {
            data: "экземпляр маршрута :" + getFirstValue(_net['rdfs:label']),
            type: _String
      }];
    if (process_inVars.length > 0) new_process['v-wf:inVars'] = new_vars;

    //print("new_process=", toJson(new_process));

    put_individual(ticket, new_process, _event_id);

    document['v-wf:isProcess'] = [
        {
            data: new_process_uri,
            type: _Uri
      }];
    put_individual(ticket, document, _event_id);
    //print("[WORKFLOW]:new_process:" + new_process['@']);
}
