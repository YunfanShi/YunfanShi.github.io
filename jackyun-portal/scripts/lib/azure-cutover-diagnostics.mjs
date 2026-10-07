const known = {
  '28P01': ['DATABASE_PASSWORD_REJECTED','数据库拒绝了密码，请确认数据库账号及对应的数据库密码。'],
  '28000': ['DATABASE_LOGIN_DENIED','数据库登录被拒绝，请检查账号、访问规则及登录方式。'],
  '3D000': ['TARGET_DATABASE_MISSING','目标数据库不存在，请核对实际迁移数据库名称。'],
  '42501': ['DATABASE_PERMISSION_DENIED','登录成功，但账号没有执行检查所需的读取权限。'],
  '42P01': ['DATABASE_RELATION_MISSING','登录成功，但检查需要的表不存在，需要核对已恢复的数据库结构。'],
  '42703': ['DATABASE_COLUMN_MISSING','登录成功，但检查需要的列不存在，需要核对迁移版本。'],
  '42883': ['DATABASE_FUNCTION_MISSING','登录成功，但检查需要的数据库函数不存在。'],
  '57014': ['DATABASE_QUERY_TIMEOUT','数据库检查超时，尚未得到完整结果。'],
  'ENOTFOUND': ['DATABASE_DNS_FAILED','数据库域名无法解析，请检查网络、VPN和私有 DNS。'],
  'EAI_AGAIN': ['DATABASE_DNS_FAILED','数据库域名暂时无法解析。'],
  'ETIMEDOUT': ['DATABASE_CONNECTION_TIMEOUT','数据库连接超时，请检查 VPN、私网路径和数据库防火墙。'],
  'ECONNREFUSED': ['DATABASE_CONNECTION_REFUSED','数据库端口拒绝连接，请检查数据库状态和网络规则。'],
  'ECONNRESET': ['DATABASE_CONNECTION_RESET','数据库连接被网络或服务端中断。'],
  'ENOENT': ['CA_FILE_MISSING','指定的 CA 证书文件不存在。'],
  'DATABASE_TLS_UNAVAILABLE': ['DATABASE_TLS_UNAVAILABLE','数据库端口未返回 PostgreSQL TLS 支持，请检查代理和连接地址。'],
};
const stages = {
  source_configuration:'读取 Supabase 连接配置',target_configuration:'读取 Azure 连接配置',
  source_connect:'连接 Supabase 数据库',target_connect:'连接 Azure 数据库',
  source_catalog:'检查 Supabase 表结构与权限',target_catalog:'检查 Azure 表结构与权限',
  compare_catalog:'比较账号与迁移结构',source_manifest:'读取 Supabase 全表指纹',
  target_manifest:'读取 Azure 全表指纹',compare_manifest:'比较全表指纹',archive:'保存检查报告',
  evidence:'验证生产切换证据',apply:'执行数据库切换',
};
const validation = {
  'Legacy backup source guards required':['BACKUP_SOURCE_GUARDS_REQUIRED','源端旧备份入口的切换保护未安装或状态不符，不能冻结并追平。'],
  'Missing tables or RLS':['SYNC_TABLES_OR_RLS_MISSING','同步表不齐全或未启用行权限。'],
  'Sync columns missing':['SYNC_SCHEMA_MISSING','未能读取同步表的列结构。'],
  'Sync columns differ':['SYNC_SCHEMA_MISMATCH','两边同步表的列结构不同，不能执行追平。'],
  'Existing fence requires explicit recovery':['EXISTING_WRITE_FENCE','发现已有迁移写入围栏，需先检查之前的操作结果。'],
  'Unexpected database':['UNEXPECTED_DATABASE','当前连接的数据库名称与迁移目标不符。'],
  'Provision identity delta separately':['IDENTITY_DELTA_REQUIRED','源库与目标库的账号集合不同，需先补齐新增账号。'],
  'Backup schema differs':['BACKUP_SCHEMA_MISMATCH','两边的备份队列结构不同，需先确认迁移范围。'],
  'Delegated grants need owner review':['DELEGATED_ACL_REVIEW_REQUIRED','源库存在委派授权，需先核对可准确恢复的权限。'],
  'Drain prepared transactions and pause jobs first':['BACKGROUND_WRITERS_ACTIVE','存在未排空的预备事务或活跃定时任务。'],
  'Application manifest incomplete':['APPLICATION_MANIFEST_INCOMPLETE','没有取得完整应用表清单。'],
};

export async function atStage(stage, work) {
  try { return await work(); }
  catch (error) { error.cutoverStage ??= stage; throw error; }
}
export function safeDiagnostic(error) {
  let match = known[error.code] ?? validation[error.message];
  if (!match && /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ISSUER/.test(error.code ?? '')) match = ['DATABASE_TLS_FAILED','数据库 TLS 证书校验失败，请核对可信 CA；无需关闭证书验证。'];
  if (!match && /timeout|timed out/i.test(error.message ?? '')) match = known.ETIMEDOUT;
  return { ok:false,code:error.cutoverCode ?? match?.[0] ?? 'CUTOVER_PREFLIGHT_FAILED',
    stage:error.cutoverStage ?? 'unknown',step:stages[error.cutoverStage] ?? '初始化检查',
    message:match?.[1] ?? '检查未完成，请依据失败步骤继续诊断；未输出数据库私人错误详情。',
    databaseCode:/^[0-9A-Z]{5}$/.test(error.code ?? '') ? error.code : undefined,
    committed:error.committed === true,sourceFrozen:error.sourceFrozen === true,
    recoveryArchive:error.recoveryArchive ?? null };
}
