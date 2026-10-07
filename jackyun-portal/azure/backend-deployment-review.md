# 后台部署与网络费用审阅

核查日期2026-10-07。状态：用户已明确同意必要费用并优先接通SQL和同步。数据库私网与Functions Flex运行资源已创建Succeeded；后台真实存活检查200、未登录同步401。网站转发代码准备中，切换前需要冻结旧同步写入、追平五表和真实登录验收。

## 选型与具体交付

Container Apps镜像已实际构建，构建上下文38.47KB；离线运行确认普通用户uid1000、可信CA存在、共享同步模块可加载。没有发布镜像或验证云端运行。Docker Desktop已在本机启动。

官方VNet文档明确：Container Apps自建网络的workload profiles环境附带公网IP及标准负载均衡费用。按2个标准IP、1个标准负载均衡器及数据库私有终结点估算，30–31天固定网络约$32.90–33.98/月，另算DNS/处理流量和计算。因此继续比较Functions Flex，不仅比较计算免费额度。

实际CLI确认eastasia支持Functions Flex、Node24、512/2048/4096MB实例，最大实例数最低可设1。微软说明Flex的VNet集成不另收费；拟用2GB、按需执行、无Always Ready、最多1实例。共享现有同步业务实现，补Functions入口后再运行真实云端验收；本机独立HTTP演练不能替代这一步。

[backend-network.json](backend-network.json) 是可独立部署的数据库网络：新VNet、独立后台委派子网、独立数据库私有终结点子网、仅后台子网5432入站的NSG、PostgreSQL私有终结点和DNS链接/组。私有终结点目标是数据库，不是Container Apps入口，因此不触发Container Apps私有入口管理费。

模板固定eastasia、jackyunasia及新VNet名称，不接受任意目标。预验证Succeeded；what-if六项Create，现有PostgreSQL、Blob、Key Vault、托管身份均Ignore。部署为Incremental；没有数据库重建或防火墙放宽。真实DNS私有解析、NSG、TLS及服务端连通性仍需部署后验证。后台仍使用原服务器域名校验证书，不关闭TLS。

## 微软公开USD单价

Retail Prices API核查结果见 [meter采样](backend-price-evidence.json)。公开价不等于学生订阅账单；余额/优惠生效仍未核实。费用不含税、汇率及其他服务。

| 项目 | 单价 | 计费边界 |
| --- | --- | --- |
| 数据库Standard Private Endpoint | $0.01/小时 | 创建后即计费，即使后台缩到零 |
| 终结点处理流量首阶梯 | 入站$0.01/GB、出站$0.01/GB | 两个方向各按处理字节计算 |
| 私有DNS区域 | $0.50/区域/月 | 一个PostgreSQL区域；不是DNS Private Resolver |
| 私有DNS查询 | $0.40/百万次 | 另计查询量 |
| Functions Flex香港On Demand | $0.000037/GB秒；$0.000004/10次执行 | 不启用Always Ready；进程内缓存不等于停止计费 |
| Container Apps香港计算 | 活跃CPU$0.000024/核秒；内存$0.000003/GiB秒 | 仅作方案比较，未创建 |
| 标准公网IPv4香港 | $0.005/IP/小时 | Container Apps自建网络估算两个IP |
| 标准负载均衡器基础规则 | $0.025/小时 | 前5条；额外规则和流量另计 |

Functions Flex官网列出每订阅每月250,000次、100,000GB秒免费量，但注明限付费Consumption订阅；**不能保证Azure for Students适用**。报价先按没有免费量计算，不升级订阅或支付方式来换免费量。函数的运行/部署存储另按Blob/Queue等meter计算，不能称为包含在计算免费量内；拟隔离运行存储，避免给后台运行时授予现有私人文件账号的全账户管理权。

## 月费示例与创建范围

数据库网络固定费：30天720小时×$0.01+$0.50=$7.70；31天744小时×$0.01+$0.50=$7.94。平均730小时约$7.80。另加终结点每方向字节与DNS查询；已有数据库/Blob/Key Vault费用独立累计。

以2GB实例、每次占用2秒、无免费量且无Always Ready为例，执行费用为`次数×2GB×2秒×0.000037 + 次数/10×0.000004`：

| 每月执行次数 | 后台执行费 | 加平均月数据库网络 |
| --- | --- | --- |
| 10,000 | $1.484 | $9.284 |
| 100,000 | $14.84 | $22.64 |
| 1,000,000 | $148.40 | $156.20 |

这些是用量情景，不是网站预测；2秒假设需真实云端测量，并发请求按实例活动时间计费，不能直接用请求数推实际账单。最大1实例限制扩容，不是支出硬上限；预算也仅提醒。初期不开Always Ready、付费日志采集、Front Door、NAT网关、ACR、VM或Container Apps环境。

用户此前明确要求新增收费先列明情况。本批网络及必要后台费用已经用户明确认可。网络部署jackyun-backend-network-20261007、运行部署jackyun-sync-runtime-20261007均Succeeded。Functions使用独立LRS运行存储、2GB按需实例、最多1实例、无Always Ready。数据库密码保存为Key Vault单项密钥，运行身份只读这一项；临时操作员单项写入权限已撤回。实际学生优惠及账单仍未验证。

```powershell
# 仅预检，不能当成已部署。
az deployment group validate -g JackYun --template-file azure/backend-network.json
az deployment group what-if -g JackYun --template-file azure/backend-network.json
# 用户明确认可新增费用后，再按Incremental创建同一模板。
```

依据：[Container Apps自建网络及附带费用](https://learn.microsoft.com/en-us/azure/container-apps/custom-virtual-networks)、[Functions Flex网络无额外集成费](https://techcommunity.microsoft.com/t5/apps-on-azure-blog/announcing-public-preview-of-azure-functions-flex-consumption/bc-p/4192511)、[Functions价格与免费量资格](https://azure.microsoft.com/en-us/pricing/details/functions/)、[PostgreSQL Private Link](https://learn.microsoft.com/en-us/azure/postgresql/network/concepts-networking-private-link)、[Retail Prices API](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)。
