import './env';
import {database} from '../lib/db';
import {execute,snapshot} from '../lib/shop';
async function main(){
 if(!process.argv.includes('--confirm'))throw new Error('This adds SAMPLE fixtures to the configured live database. Run with --confirm only when intended.');
 const db=await database();let count=0;const run=(action:string,data:Record<string,unknown>,key:string)=>execute(db,action,data,'sample-live-v1-'+key,'SAMPLE seed');
 try{
 const supplier=await run('party',{name:'SAMPLE · Fresh Meat Supplier',kind:'supplier',contact:'Sample supplier — test only'},'supplier');
 const supplier2=await run('party',{name:'SAMPLE · Poultry & Frozen Supply',kind:'supplier'},'supplier2');
 const customer=await run('party',{name:'SAMPLE · Maria Santos',kind:'customer',contact:'Sample credit customer'},'customer');
 await run('party',{name:'SAMPLE · Neighborhood Eatery',kind:'customer'},'customer2');
 await run('funds',{amount:'30000',account:'Cash',reason:'SAMPLE opening cash — not actual shop funds'},'funds');
 const fixtures=[
  ['SAMPLE-P001','Pork Belly','Pork','310','290','220','80'],
  ['SAMPLE-P002','Pork Shoulder','Pork','239','219','150','100'],
  ['SAMPLE-P003','Pork Head','Pork','160','145','100','50'],
  ['SAMPLE-C001','Whole Chicken','Chicken','189','175','125','80'],
  ['SAMPLE-C002','Chicken Breast','Chicken','260','245','185','50'],
  ['SAMPLE-B001','Beef Brisket','Beef','389','359','270','40'],
  ['SAMPLE-B002','Beef Tapa Cut','Beef','420','395','300','40'],
  ['SAMPLE-F001','Frozen Hotdog','Frozen goods','155','140','105','50'],
 ];
 const products:Record<string,any>={};
 for(const [code,name,category,retail,bulk,cost,weight] of fixtures){
  const p=await run('product',{code,name:name+' (SAMPLE)',category,unit:'kg',retail,bulk,box:bulk,lowStock:'5',brand:'SAMPLE fixture'},code);products[code]=p;
  const partyId=category==='Chicken'||category==='Frozen goods'?supplier2.id:supplier.id;
  const order=await run('purchase',{partyId,reference:'SAMPLE delivery '+code,lines:[{productId:p.id,quantity:weight,cost,boxes:2}]},code+'-order');
  await run('receive',{orderId:order.id,locationId:'storage',lines:[{index:0,quantity:weight,boxes:2}]},code+'-receive');
  await run('transfer',{productId:p.id,from:'storage',to:'freezer',quantity:'20',reason:'SAMPLE freezer replenishment'},code+'-transfer');
  await run('supplierPayment',{documentId:order.id,amount:'1000'},code+'-supplier-payment');count++;
 }
 const service=await run('product',{code:'SAMPLE-S001',name:'Grinding Charge (SAMPLE)',category:'Services',unit:'service',serviceUnit:'portion',retail:'10'},'service');
 const sale=await run('sale',{locationId:'freezer',lines:[{productId:products['SAMPLE-P002'].id,quantity:'5.950',tier:'retail'},{productId:service.id,quantity:'2',tier:'retail'}],tendered:'1500'},'walkin-sale');
 await run('sale',{locationId:'freezer',lines:[{productId:products['SAMPLE-C001'].id,quantity:'2.500',tier:'retail'}],tendered:'500'},'chicken-sale');
 const credit=await run('sale',{partyId:customer.id,locationId:'freezer',lines:[{productId:products['SAMPLE-B001'].id,quantity:'5.000',tier:'bulk'}],tendered:'500'},'credit-sale');
 await run('payment',{documentId:credit.id,amount:'300',tendered:'300'},'customer-payment');
 await run('draft',{partyId:customer.id,locationId:'freezer',lines:[{productId:products['SAMPLE-P001'].id,quantity:'3.000',tier:'retail'}]},'draft');
 await run('return',{saleId:sale.id,index:0,quantity:'0.500',restock:true,reason:'SAMPLE customer return'},'return');
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await run('expense',{category:'Electricity',payee:'SAMPLE utility',amount:'450',date:day,notes:'SAMPLE fixture — freezer electricity'},'electricity');
 await run('expense',{category:'Packaging',payee:'SAMPLE packaging supplier',amount:'180',date:day,notes:'SAMPLE fixture — bags and labels'},'packaging');
 const s=await snapshot(db);console.log(JSON.stringify({samplePhysicalProducts:count,products:s.products.length,documents:s.documents.length,balanced:s.report.balanced,receivables:s.report.receivables/100,payables:s.report.payables/100}));
 }finally{await db.close();}
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
