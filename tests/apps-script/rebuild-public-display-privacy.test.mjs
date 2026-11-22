import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const code=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Code.gs',import.meta.url)),'utf8');
const html=readFileSync(fileURLToPath(new URL('../../rebuild/v4.8.1/Index.html',import.meta.url)),'utf8');

function extract(source,name){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('\nfunction ',start+1);
  assert.ok(start>=0&&end>start,'source boundaries must exist for '+name);
  return source.slice(start,end);
}

function runPublicTicker(rows){
  const context={
    rows_:()=>rows,
    sheet_:key=>{assert.equal(key,'vip');return {};},
    clean_:(value,max)=>String(value??'').replace(/[<>]/g,'').trim().slice(0,max),
    Date,String,Array
  };
  vm.createContext(context);
  vm.runInContext(extract(code,'apiGetPublicVipTicker'),context,{timeout:1000});
  return context.apiGetPublicVipTicker();
}

test('rebuild public VIP ticker only projects verified joined members and approved public visibility',()=>{
  const rows=[
    ['q1','MPS-AAAA','Budi Santoso','JOINED','',new Date('2026-11-20T00:00:00Z'),true,true,'sensitive-chat-id','private-proof-id'],
    ['q2','MPS-BBBB','Calon Member','PENDING','',new Date(),true,true,'private-chat','proof'],
    ['q3','MPS-CCCC','Tidak Dipublikasikan','JOINED','',new Date(),true,false,'private-chat','proof'],
    ['q4','MPS-DDDD','Belum diverifikasi','JOINED','',new Date(),false,true,'private-chat','proof'],
    ['q5','MPS-EEEE','Siti Rahma','JOINED','',new Date('2026-11-21T00:00:00Z'),'true','true','private-chat','proof']
  ];
  const result=runPublicTicker(rows);
  assert.equal(result.length,2);
  assert.deepEqual(JSON.parse(JSON.stringify(result.map(x=>x.nickname))),['Siti Rahma','Budi Santoso']);
  for(const item of result){
    assert.deepEqual(Object.keys(item).sort(),['joinedAt','nickname']);
    assert.ok(!JSON.stringify(item).includes('MPS-'));
    assert.ok(!JSON.stringify(item).includes('private'));
  }
});

test('public VIP ticker limits output to eight most recent eligible join events',()=>{
  const rows=Array.from({length:12},(_,i)=>[
    'q'+i,'MPS-'+i,'Member '+i,'JOINED','',
    new Date(Date.UTC(2026,0,i+1)),true,true,'chat-'+i,'proof-'+i
  ]);
  const result=runPublicTicker(rows);
  assert.equal(result.length,8);
  assert.equal(result[0].nickname,'Member 11');
  assert.equal(result.at(-1).nickname,'Member 4');
});

test('public announcement audience is public-only; member and admin views require valid role sessions',()=>{
  const start=Date.now();
  const rows=[
    ['a-public','Publik','Untuk semua','PUBLIC',new Date(start-60000),new Date(start+60000),true],
    ['a-member','Member','Khusus member','MEMBER',new Date(start-60000),new Date(start+60000),true],
    ['a-expired','Lewat','Tidak aktif','PUBLIC',new Date(start-120000),new Date(start-60000),true],
    ['a-disabled','Draft','Belum aktif','PUBLIC',new Date(start-60000),new Date(start+60000),false]
  ];
  const context={
    rows_:()=>rows,
    sheet_:key=>{assert.equal(key,'announcements');return {};},
    requireSession_:(token,roles)=>{
      assert.ok(token);
      const role=token==='member-token'?'MEMBER':'ADMIN';
      assert.ok(roles.includes(role));
      return {role,actorId:'TEST-ACTOR'};
    },
    assertMembershipEntitlement_:id=>assert.equal(id,'TEST-ACTOR'),
    clean_:(value,max)=>String(value??'').trim().slice(0,max),
    Date,String,Array
  };
  vm.createContext(context);
  vm.runInContext(extract(code,'apiGetAnnouncements'),context,{timeout:1000});
  const publicItems=context.apiGetAnnouncements('');
  assert.deepEqual(JSON.parse(JSON.stringify(publicItems.map(x=>x.id))),['a-public']);
  const memberItems=context.apiGetAnnouncements('member-token');
  assert.deepEqual(JSON.parse(JSON.stringify(memberItems.map(x=>x.id))),['a-public','a-member']);
  const adminItems=context.apiGetAnnouncements('admin-token');
  assert.deepEqual(JSON.parse(JSON.stringify(adminItems.map(x=>x.id))),['a-member','a-public']);
});

test('homepage public ticker renders server-projected names as text, not HTML',()=>{
  const start=html.indexOf('async function loadPublicVipTicker(){');
  assert.ok(start>=0,'homepage public ticker loader must exist');
  const end=html.indexOf('\n',start);
  const loader=html.slice(start,end);
  assert.match(loader,/textContent\s*=/);
  assert.doesNotMatch(loader,/innerHTML\s*=/);
  assert.match(loader,/apiGetPublicVipTicker/);
});
