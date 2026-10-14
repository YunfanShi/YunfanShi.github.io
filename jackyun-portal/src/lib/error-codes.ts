export const ERROR_CODES = {
  'JY-1001': {message:'登录状态已失效，请重新登录后重试。', area:'账号', action:'重新登录', aliases:['UNAUTHORIZED','AUTH_REQUIRED','SESSION_EXPIRED']},
  'JY-1002': {message:'你暂时没有权限执行此操作。', area:'账号', action:'检查账号权限或联系管理员', aliases:['FORBIDDEN','DEVICE_REVOKED','ACCOUNT_SUSPENDED','ACCOUNT_DELETED']},
  'JY-1003': {message:'登录服务暂时不可用，请稍后重试。', area:'账号', action:'稍后重试', aliases:['AUTH_UNAVAILABLE','AUTH_SERVICE_UNAVAILABLE']},
  'JY-2001': {message:'网络连接失败，请检查网络后重试。', area:'网络', action:'检查网络连接', aliases:['NETWORK_ERROR','FETCH_FAILED']},
  'JY-2002': {message:'请求等待超时，请重试。', area:'网络', action:'重试；本机未提交的修改会保留', aliases:['TIMEOUT','REQUEST_TIMEOUT']},
  'JY-2003': {message:'请求过于频繁，请稍后再试。', area:'网络', action:'等待后重试', aliases:['RATE_LIMITED','RATE_LIMIT_EXCEEDED']},
  'JY-2004': {message:'服务暂时不可用，请稍后重试。', area:'服务', action:'稍后重试或查看服务状态', aliases:['SERVICE_UNAVAILABLE','BACKEND_UNAVAILABLE']},
  'JY-2005': {message:'请求没有完成，请稍后重试。', area:'服务', action:'重试并保留错误日志', aliases:['REQUEST_FAILED','INTERNAL_ERROR','INTERNAL_SERVER_ERROR']},
  'JY-2101': {message:'同步服务暂时不可用，本机修改已保留。', area:'同步', action:'稍后同步；不要清除本机数据', aliases:['SYNC_UNAVAILABLE','SYNC_CONFIGURATION_ERROR','SYNC_REMOTE_UNAVAILABLE']},
  'JY-2102': {message:'本次修改尚未被云端确认，待同步数据已保留。', area:'同步', action:'重试同步', aliases:['SYNC_WRITE_FAILED','UPLOAD_WRITE_FAILED','UPLOAD_READ_FAILED','UPLOAD_RESET_FAILED']},
  'JY-2103': {message:'云端内容已经变化，系统将重新核对版本。', area:'同步', action:'等待自动重新合并；真实冲突到同步中心处理', aliases:['REVISION_CHANGED','RESTORE_VERSION_CHANGED','SYNC_BASE_MISSING','SYNC_CONFLICT']},
  'JY-2104': {message:'同步数据未通过完整性校验，原始内容已保留。', area:'同步', action:'重试同步并复制日志', aliases:['INVALID_DELTA','INVALID_PART','UPLOAD_INCOMPLETE','OPERATION_ID_REUSED','SYNC_INTEGRITY_FAILED']},
  'JY-2105': {message:'请刷新旧页面后再同步，本机修改已保留。', area:'同步', action:'刷新所有设备上的旧页面', aliases:['SYNC_UPGRADE_REQUIRED']},
  'JY-2106': {message:'云端版本发生回退，本机内容和同步基准已保留。', area:'同步', action:'联系管理员核对云端版本', aliases:['SYNC_VERSION_ROLLBACK']},
  'JY-3001': {message:'提交的数据不符合要求，请检查输入。', area:'输入', action:'检查必填项和数据格式', aliases:['INVALID_BODY','INVALID_OPERATIONS','INVALID_KEY','INVALID_CURSOR','VALIDATION_ERROR','BAD_REQUEST']},
  'JY-3002': {message:'数据超过本次操作允许的大小。', area:'输入', action:'缩小文件或分批处理', aliases:['PAYLOAD_TOO_LARGE','EXPORT_SCAN_LIMIT','MANIFEST_SCAN_LIMIT']},
  'JY-3003': {message:'所需内容不存在或已被移除。', area:'内容', action:'刷新列表或核对链接', aliases:['NOT_FOUND','RECORD_NOT_FOUND']},
  'JY-3101': {message:'本机数据暂时无法保存，请检查浏览器存储空间。', area:'存储', action:'释放空间；不要清除尚未同步的数据', aliases:['QUOTA_EXCEEDED','STORAGE_FAILED']},
  'JY-4001': {message:'页面加载失败，请重试或刷新页面。', area:'页面', action:'刷新页面并复制日志', aliases:['RENDER_FAILED','PAGE_RENDER_FAILED']},
  'JY-4002': {message:'页面资源加载失败，请检查网络并刷新。', area:'页面', action:'刷新页面', aliases:['RESOURCE_LOAD_FAILED','CHUNK_LOAD_FAILED']},
  'JY-4003': {message:'运行此功能时出现了错误，请重试。', area:'运行', action:'重试并复制日志', aliases:['CLIENT_RUNTIME_ERROR']},
  'JY-5001': {message:'AI 返回的内容暂时无法解析，请重试。', area:'AI', action:'重试请求', aliases:['AI_PARSE_FAILED']},
  'JY-5002': {message:'AI 请求没有完成，请稍后重试。', area:'AI', action:'重试或检查 AI 服务配置', aliases:['AI_REQUEST_FAILED']},
  'JY-6001': {message:'外部服务操作未完成，请检查连接后重试。', area:'集成', action:'检查外部服务授权与连接', aliases:['INTEGRATION_FAILED']},
  'JY-9001': {message:'操作未完成，请重试；持续出现时请复制日志反馈。', area:'其他', action:'复制日志并反馈', aliases:[]},
} as const;
export type SiteErrorCode = keyof typeof ERROR_CODES;

export function resolveErrorCode(input: {code?:string;status?:number;tag?:string;message?:string}): SiteErrorCode {
  if(input.code && Object.hasOwn(ERROR_CODES,input.code))return input.code as SiteErrorCode;
  for(const [code,definition] of Object.entries(ERROR_CODES))if((definition.aliases as readonly string[]).includes(input.code ?? ''))return code as SiteErrorCode;
  const hint=`${input.tag ?? ''} ${input.message ?? ''} ${input.code ?? ''}`;
  if(/AbortError|取消|cancelled/i.test(hint))return 'JY-2002';
  if(/QuotaExceeded|IndexedDB|存储|storage full/i.test(hint))return 'JY-3101';
  if(/回退|rollback/i.test(hint))return 'JY-2106';
  if(/校验|解压|分片不完整/i.test(hint))return 'JY-2104';
  if(/ChunkLoad|ResourceError|loading chunk|module script/i.test(hint))return 'JY-4002';
  if(/ErrorBoundary|portal-error|admin-error|render error/i.test(hint))return 'JY-4001';
  if(/AIParse|AI JSON|解析失败/i.test(hint))return 'JY-5001';
  if(input.status===401)return 'JY-1001';
  if(input.status===403)return 'JY-1002';
  if(input.status===404)return 'JY-3003';
  if(input.status===408 || input.status===504 || /TimeoutError|超时/i.test(hint))return 'JY-2002';
  if(input.status===413)return 'JY-3002';
  if(input.status===429)return 'JY-2003';
  if(/Sync|同步|SYNC_|UPLOAD_/i.test(hint))return input.status && input.status>=500?'JY-2101':'JY-2102';
  if(/AI|LLM/i.test(hint))return 'JY-5002';
  if(/Dida|Integration|集成/i.test(hint))return 'JY-6001';
  if(input.status && input.status>=500)return 'JY-2004';
  if(input.status && input.status>=400)return 'JY-3001';
  if(/Network|XHR|fetch/i.test(hint))return 'JY-2001';
  if(/GlobalError|UnhandledRejection/i.test(hint))return 'JY-4003';
  return 'JY-9001';
}
