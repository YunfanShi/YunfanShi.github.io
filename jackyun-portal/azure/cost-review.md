# 首批 Azure 资源费用核查

核查日期：2026-10-07。用户偏好：尽量不产生费用；收费前列出具体情况。此偏好优先于原计划的每月 5 美元试点预算。
本费用核查在创建前完成；随后用户认可价格并完成创建，实际部署状态见 [基础设施记录](README.md)。此记录不证明账单为零或免费额度已生效。

## 已核实和仍未核实

- 门户实查：订阅仍显示 Azure for Students、状态可用；资源数显示只有 PostgreSQL 灵活服务器。未启用 Defender。
- 官方学生方案包含 100 美元、12 个月内使用的赠金；赠金用尽订阅会停用，升级按量付费后规则不同。
- 门户给出的余额入口为 Microsoft Azure Sponsorships，但本次同账号登录后显示 This account does not have an active Sponsorship。**剩余赠金、优惠到期日和实际账单未能核实**，不能写成余额 100 美元或零扣费。
- 用户贴出的目录标注：Blob 首年 5 GB Hot LRS、20,000 次读/10,000 次写；Key Vault 首年每月 10,000 次普通机密或 RSA2048 操作；PostgreSQL 首年 B1ms 750 小时及 32 GB 数据/备份。
  目录说明优惠，不代替个人账单中的生效状态和 meter 匹配。新建日期也不自动证明所有优惠到期日。
- Supabase 只读聚合：头像 2 个、236,632 字节；小说文件 28 个、24,645,860 字节；合计约 24.9 MB，大小元数据均存在。未下载验证真实文件字节。

## 香港现行 USD 零售价

直接查询微软 Retail Prices API：armRegionName=eastasia、priceType=Consumption，结果无下一页；对拟用产品/SKU核对如下。
这些是优惠以外的公开零售价，不是个人订阅最终报价，不含税、汇率、其他功能或网络费用。
新增后台和数据库私网的独立收费审阅见 [后台部署费用](backend-deployment-review.md)。原基础资源价格认可以及本文件中的目标零费，不涵盖新增私有终结点固定收费；此次网络尚未创建。

| 项目 | meter/SKU | 单价 | 收费触发条件 |
| --- | --- | --- | --- |
| Blob容量 | General Block Blob v2 / Hot LRS Data Stored，首个容量阶梯 | $0.024/GB/月 | 超过适用免费容量，或首年优惠到期 |
| Blob写入 | Hot LRS Write Operations | $0.05/10,000次 | 超过适用写入额度或优惠到期 |
| Blob读 | Hot Read Operations | $0.004/10,000次 | 超过适用读取额度或优惠到期 |
| Blob列举/建容器 | LRS List and Create Container Operations | $0.05/10,000次 | 按实际 meter 与优惠覆盖核对，不假设额外免费 |
| Blob其他操作 | All Other Operations | $0.004/10,000次 | 按实际 meter 与优惠覆盖核对 |
| Key Vault普通操作 | Standard / Operations | $0.03/10,000次 | 超过适用 10,000 次额度或优惠到期 |
| 托管身份 | 用户分配身份 | 无额外身份费用 | 使用身份访问的服务仍按各自规则计费 |
| 普通互联网出站 | Microsoft Global Network / Standard Data Transfer Out | 每月前100GB零价，随后首阶梯$0.12/GB | Azure出站总量超额，不是每个容器各100GB |
| Azure跨区域传输 | Standard Inter-Region Data Transfer | $0.08/GB | 香港和其他Azure区域之间的收费方向传输，不能套互联网100GB额度 |
| 已有数据库计算 | Flexible Server Burstable BS Series / B1MS | $0.0286/小时 | 免费750小时未生效、已用完或首年结束 |
| 已有数据库存储 | Flex Server Storage / Storage Data Stored | $0.15/GB/月 | 超过适用32GB额度或首年结束 |
| 数据库备份超额 | Flexible Server Backup Storage / LRS | $0.095/GB/月 | 超过适用免费备份额度；先查账单meter |

Hot 层没有选用 Cool/Archive 的取回与提前删除费。未配置 HSM、证书购买/续签、自动密钥轮换、Blob index tags 或 inventory；不要误套这些 meter 的价格。
软删除保留的字节仍计存储。当前模板无需付费虚拟机、Files挂载盘、SFTP、专用终结点、Front Door或常驻计算；空容器不预分配5GB容量。

## 可审阅的费用示例

1. 首年额度确实生效、存储和请求都在额度内，普通公网出站也未超100GB：本批目标为 $0。
   现有约25MB文件远低于5GB容量，但未来上传、历史版本、软删除、备份和请求增长仍需限制。
2. 首年内只将有效计费容量增至10GB：超出5GB的5GB×$0.024≈$0.12/月，另算操作与网络。
3. 首年内容量10GB、每月100,000读、20,000写、20,000次普通Key Vault操作、150GB普通公网出站，假设上述免费额度都生效且其他用量为零：
   容量$0.12＋读$0.032＋写$0.05＋Key Vault$0.03＋公网出站$6＝约$6.232/月。
   这是计算示例，不是网站用量预测；未计列举、其他操作、后台、日志和税。
4. 优惠到期后，已有B1ms连续运行、32GB磁盘：30天约$25.39，31天约$26.08/月。
   公式为720或744小时×$0.0286＋32×$0.15；额外备份、网络、监控另算。

即使现金未扣款，超出服务免费额度也可能先消耗学生赠金；不能把赠金抵扣称为服务永久免费。
本次未更改订阅、支付方式或支出限制，不升级按量付费、不购买市场附加产品。

## 实施边界

- 最终资源创建仍需接受门户条款；用户的“检查费用”不是新的创建确认。
- 创建前先说明本记录中的无法核实项，不保证永不收费。收费计算/日志/Front Door等后续资源分别给出报价后再推进。
- 应用开发目标：总有效文件容量≤4GB，为保留版本和软删除留余量；读写计数、赠金、费用和优惠到期均监控。
  目前这些限制尚未实现，不能当作已生效保护；Azure预算提醒不是硬停止开关，也不能严格阻止SAS上传字节超额。
- 后台缩容到零、机密缓存和有限日志有助于控制用量，不能在未部署/未实测前称为零成本运行。
- 迁移期旧Supabase下载仍可能使用其出站额度；文件约25MB是元数据估计，迁移时还需实际校验。

依据：[微软零售价API说明](https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices/azure-retail-prices)、[Blob价格](https://azure.microsoft.com/en-us/pricing/details/storage/blobs/)、[Key Vault价格](https://azure.microsoft.com/en-us/pricing/details/key-vault/)、[带宽价格](https://azure.microsoft.com/en-us/pricing/details/bandwidth/)、[学生方案](https://azure.microsoft.com/en-us/pricing/offers/ms-azr-0170p/)、[托管身份说明](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/overview)。
