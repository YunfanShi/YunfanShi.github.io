import { dateKey, type CueReview, type LearningStatus } from './schedule-control.ts';
export type CueShopCategory = 'effect' | 'theme' | 'title' | 'frame' | 'credit';
export type CueShopItem = {
    id: string;
    name: string;
    category: CueShopCategory;
    level: number;
    stars: number;
    xp: number;
    description: string;
    value: string | number;
};
export const CUE_SHOP_ITEMS: CueShopItem[] = [
    { id: 'effect-solar', name: '日冕爆发', category: 'effect', level: 2, stars: 18, xp: 0, value: 3, description: '金色日冕层层扩散，释放细长光芒。' },
    { id: 'effect-warp', name: '曲速跃迁', category: 'effect', level: 4, stars: 48, xp: 0, value: 4, description: '从深空穿越星轨，汇入明亮星核。' },
    { id: 'effect-ribbon', name: '星云织光', category: 'effect', level: 6, stars: 0, xp: 220, value: 5, description: '交织的光带收拢后，绽放成星云。' },
    { id: 'effect-binary', name: '双星共舞', category: 'effect', level: 8, stars: 120, xp: 0, value: 6, description: '两颗星核沿轨道汇聚，再向远方释放。' },
    { id: 'effect-prism', name: '棱镜星阵', category: 'effect', level: 10, stars: 180, xp: 0, value: 7, description: '晶体星阵与细密折射光束。' },
    { id: 'effect-galaxy', name: '银河回响', category: 'effect', level: 15, stars: 260, xp: 0, value: 8, description: '多重旋臂在宽阔星场中展开。' },
    { id: 'theme-ice', name: '冰蓝远空', category: 'theme', level: 1, stars: 9, xp: 0, value: 'ice', description: '冷蓝星尘与清澈的银色星核。' },
    { id: 'theme-violet', name: '紫晶星云', category: 'theme', level: 3, stars: 28, xp: 0, value: 'violet', description: '紫晶薄雾笼罩旋臂，三种状态星仍清晰。' },
    { id: 'theme-rose', name: '玫瑰深空', category: 'theme', level: 5, stars: 60, xp: 0, value: 'rose', description: '柔和玫瑰色星云，低亮度背景。' },
    { id: 'theme-amber', name: '琥珀银河', category: 'theme', level: 9, stars: 140, xp: 0, value: 'amber', description: '温暖星尘与琥珀色银河核心。' },
    { id: 'title-first', name: '初见星光', category: 'title', level: 1, stars: 6, xp: 0, value: '初见星光', description: '侧栏称号，献给持续开始的你。' },
    { id: 'title-explorer', name: '星际探索者', category: 'title', level: 2, stars: 0, xp: 80, value: '星际探索者', description: '用可用 XP 兑换；累计等级经验继续保留。' },
    { id: 'title-navigator', name: '星海领航员', category: 'title', level: 5, stars: 0, xp: 260, value: '星海领航员', description: '星海旅程的进阶称号。' },
    { id: 'title-keeper', name: '星空收藏家', category: 'title', level: 10, stars: 0, xp: 600, value: '星空收藏家', description: '为越来越丰富的收藏点亮名字。' },
    { id: 'title-voyager', name: '银河远征者', category: 'title', level: 18, stars: 0, xp: 1200, value: '银河远征者', description: '长程学习的珍藏称号。' },
    { id: 'frame-orbit', name: '银环仪表', category: 'frame', level: 2, stars: 12, xp: 0, value: 'orbit', description: '侧栏带细银环与角落标记。' },
    { id: 'frame-prism', name: '紫晶舷窗', category: 'frame', level: 4, stars: 35, xp: 0, value: 'prism', description: '紫晶边缘与渐变舷窗。' },
    { id: 'frame-solar', name: '日耀舰桥', category: 'frame', level: 8, stars: 0, xp: 420, value: 'solar', description: '温暖金色的舰桥仪表框。' },
    { id: 'credit-small', name: '启航积分包', category: 'credit', level: 2, stars: 0, xp: 80, value: 12, description: '兑换 12 站内星空积分，每个账号限领一次；不影响累计等级。' },
    { id: 'credit-medium', name: '探索积分包', category: 'credit', level: 5, stars: 0, xp: 220, value: 38, description: '兑换 38 站内星空积分，可购买商店装饰，限领一次。' },
    { id: 'credit-large', name: '远征积分包', category: 'credit', level: 10, stars: 0, xp: 500, value: 90, description: '兑换 90 站内星空积分，可购买商店装饰，限领一次。' },
    { id: 'theme-aurora', name: '极光海岸', category: 'theme', level: 2, stars: 16, xp: 0, value: 'aurora', description: '青绿色极光与海蓝星尘。' },
    { id: 'theme-midnight', name: '午夜观测站', category: 'theme', level: 3, stars: 25, xp: 0, value: 'midnight', description: '深靛蓝背景与低亮度星尘。' },
    { id: 'theme-pearl', name: '月光珍珠', category: 'theme', level: 4, stars: 34, xp: 0, value: 'pearl', description: '银灰星尘与柔和的月光薄雾。' },
    { id: 'frame-aurora', name: '极光舷窗', category: 'frame', level: 3, stars: 22, xp: 0, value: 'aurora', description: '青绿渐变仪表边框。' },
    { id: 'frame-midnight', name: '静夜舰桥', category: 'frame', level: 6, stars: 48, xp: 0, value: 'midnight', description: '深蓝玻璃质感的舰桥仪表。' },
    { id: 'title-curious', name: '好奇心飞行员', category: 'title', level: 1, stars: 8, xp: 0, value: '好奇心飞行员', description: '把每天的一个问题变成下一次启航。' },
    { id: 'title-repair', name: '记忆修补师', category: 'title', level: 3, stars: 24, xp: 0, value: '记忆修补师', description: '为认真重练的你准备的学习称号。' },
    { id: 'title-night', name: '夜航记录员', category: 'title', level: 6, stars: 50, xp: 0, value: '夜航记录员', description: '在星空收藏中展示你的旅程。' },


    { id: 'theme-emerald', name: '翡翠星海', category: 'theme', level: 2, stars: 20, xp: 0, value: 'emerald', description: '翡翠色星尘围绕青绿星云流动。' },
    { id: 'theme-sunset', name: '落日航线', category: 'theme', level: 4, stars: 42, xp: 0, value: 'sunset', description: '橙红余晖中的深空航线。' },
    { id: 'theme-nebula', name: '蓝紫回廊', category: 'theme', level: 7, stars: 85, xp: 0, value: 'nebula', description: '明亮蓝紫星核与深靛色云带。' },
    { id: 'effect-helix', name: '螺旋星桥', category: 'effect', level: 3, stars: 30, xp: 0, value: 9, description: '两条螺旋光轨交错穿过星核。' },
    { id: 'effect-flower', name: '星光花冠', category: 'effect', level: 5, stars: 58, xp: 0, value: 10, description: '六瓣星光舒展，留下柔和花冠。' },
    { id: 'frame-comet', name: '彗尾信标', category: 'frame', level: 2, stars: 18, xp: 0, value: 'comet', description: '青蓝虚线轨道，可与其他侧栏装饰叠加。' },
    { id: 'frame-starlight', name: '星芒铭牌', category: 'frame', level: 4, stars: 32, xp: 0, value: 'starlight', description: '金色角标与星芒轮廓，可分层叠加。' },
    { id: 'title-dawn', name: '晨光追寻者', category: 'title', level: 1, stars: 7, xp: 0, value: '晨光追寻者', description: '与其他学习称号一同展示。' },
    { id: 'title-cartographer', name: '星图绘制师', category: 'title', level: 4, stars: 36, xp: 0, value: '星图绘制师', description: '为一点点连接起来的知识留下名字。' },
    { id: 'title-pioneer', name: '深空开拓者', category: 'title', level: 8, stars: 95, xp: 0, value: '深空开拓者', description: '跨越熟悉边界，继续探索。' },
    { id: 'credit-scout', name: '侦察积分包', category: 'credit', level: 3, stars: 0, xp: 120, value: 19, description: '一次兑换 19 星空积分，累计等级保留。' },
    { id: 'credit-nebula', name: '星云积分包', category: 'credit', level: 7, stars: 0, xp: 360, value: 62, description: '一次兑换 62 星空积分，累计等级保留。' },

];
export type CueGameEarning = {
    id: string;
    at: string;
    stars: number;
    xp: number;
    label: string;
    sessionKey: string;
    status?: LearningStatus;
    cueId?: string;
    practice?: boolean;
    extra?: boolean;
};
export type CueGamePurchase = {
    id: string;
    itemId: string;
    at: string;
    stars: number;
    xp: number;
};
export type CueGameAccount = {
    earnings: CueGameEarning[];
    purchases: CueGamePurchase[];
    equipment: Partial<Record<CueShopCategory, string>>;
    /** Optional multi-slot loadout. Keep the primary equipment for older clients. */
    equipmentSelections?: Partial<Record<CueShopCategory, string[]>>;
};
export const emptyCueGameAccount = (): CueGameAccount => ({ earnings: [], purchases: [], equipment: {} });
/** Append-only earnings: importing old evidence, recoloring, shuffle and duplicate sync cannot erase or farm credits. */
export function reconcileCueGameAccount(value: CueGameAccount | undefined, reviews: CueReview[], now = new Date()): CueGameAccount {
    const account = value ?? emptyCueGameAccount();
    const ids = new Set(account.earnings.map(entry => entry.id));
    const earnings = [...account.earnings];
    const events: CueGameEarning[] = [];
    for (const review of reviews) {
        if (!review.cueId || !Number.isFinite(Date.parse(review.reviewedAt)) || Date.parse(review.reviewedAt) > now.getTime())
            continue;
        const key = JSON.stringify([review.cueId, review.reviewedAt, review.taskKey ?? 'legacy']);
        if (!review.practiceOnly)
            events.push({ id: `review:${key}`, at: review.reviewedAt, stars: 1, xp: 0, label: '认真检索', sessionKey: review.taskKey ?? 'legacy', status: review.status, cueId: review.cueId });
        for (const attempt of review.practiceAttempts ?? [])
            if (Number.isFinite(Date.parse(attempt.reviewedAt)) && Date.parse(attempt.reviewedAt) <= now.getTime())
                events.push({ id: `retry:${key}:${attempt.reviewedAt}`, at: attempt.reviewedAt, stars: 1, xp: 0, label: '间隔重练', sessionKey: review.taskKey ?? 'legacy', status: attempt.status, cueId: review.cueId, practice: true });
    }
    const rewardedDays = new Set(account.earnings.filter(entry => !entry.extra && entry.cueId && entry.xp > 0).map(entry => JSON.stringify([entry.cueId, dateKey(new Date(entry.at))])));
    for (const event of events.toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        if (ids.has(event.id))
            continue;
        const day = JSON.stringify([event.cueId, dateKey(new Date(event.at))]);
        event.xp = rewardedDays.has(day) ? 0 : 10;
        rewardedDays.add(day);
        ids.add(event.id);
        earnings.push(event);
    }
    const sessions = new Map<string, {
        count: number;
        streak: number;
    }>();
    const weak = new Map<string, boolean>();
    for (const event of earnings.filter(entry => !entry.extra).toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))) {
        const day = dateKey(new Date(event.at));
        const key = JSON.stringify([event.sessionKey, day]);
        const run = sessions.get(key) ?? { count: 0, streak: 0 };
        run.count++;
        run.streak = event.status === 'stable' ? run.streak + 1 : 0;
        sessions.set(key, run);
        const awards: {
            kind: string;
            amount: number;
            label: string;
        }[] = [];
        if (run.count % 10 === 0)
            awards.push({ kind: 'flow', amount: 2, label: `认真检索 ${run.count} 次` });
        if (run.streak > 0 && run.streak % 5 === 0)
            awards.push({ kind: 'streak', amount: run.streak % 20 === 0 ? 8 : 3, label: `连续 ${run.streak} 次通过` });
        const weakKey = event.cueId ?? event.id;
        if (event.practice && event.status === 'stable' && weak.get(weakKey))
            awards.push({ kind: 'repair', amount: 2, label: '薄弱项重练通过' });
        weak.set(weakKey, event.status !== 'stable');
        for (const award of awards) {
            const id = `extra:${award.kind}:${event.id}`;
            if (ids.has(id))
                continue;
            ids.add(id);
            earnings.push({ id, at: event.at, stars: award.amount, xp: 0, label: award.label, sessionKey: event.sessionKey, extra: true });
        }
    }
    return earnings.length === account.earnings.length && value ? value : { ...account, earnings };
}
export function cueShopBalance(account: CueGameAccount) {
    const earnedStars = account.earnings.reduce((sum, entry) => sum + entry.stars, 0), earnedXP = account.earnings.reduce((sum, entry) => sum + entry.xp, 0);
    const credits = account.purchases.reduce((sum, purchase) => { const item = CUE_SHOP_ITEMS.find(item => item.id === purchase.itemId && item.category === 'credit'); return sum + (item ? Number(item.value) : 0); }, 0);
    return { stars: earnedStars + credits - account.purchases.reduce((sum, entry) => sum + entry.stars, 0), xp: earnedXP - account.purchases.reduce((sum, entry) => sum + entry.xp, 0), earnedStars, earnedXP, level: Math.floor(earnedXP / 100) + 1 };
}
export function purchaseCueShopItem(account: CueGameAccount, itemId: string, now = new Date()): {
    account: CueGameAccount;
    error?: string;
} {
    const item = CUE_SHOP_ITEMS.find(item => item.id === itemId);
    if (!item)
        return { account, error: '商品不存在' };
    if (account.purchases.some(purchase => purchase.itemId === itemId))
        return { account, error: '已经拥有此商品' };
    const balance = cueShopBalance(account);
    if (balance.level < item.level)
        return { account, error: `需要 Lv.${item.level}` };
    if (balance.stars < item.stars || balance.xp < item.xp)
        return { account, error: '余额不足' };
    return { account: { ...account, purchases: [...account.purchases, { id: `purchase:${item.id}`, itemId: item.id, at: now.toISOString(), stars: item.stars, xp: item.xp }] } };
}
export function cueEquipLimit(category: CueShopCategory): number {
    return category === 'credit' ? 0 : category === 'theme' ? 1 : 3;
}
export function cueEquippedItems(account: CueGameAccount, category: CueShopCategory): CueShopItem[] {
    const ids = account.equipmentSelections?.[category] ?? (account.equipment[category] ? [account.equipment[category]!] : []);
    const owned = new Set(account.purchases.map(purchase => purchase.itemId));
    return [...new Set(ids)].flatMap(id => {
        const item = CUE_SHOP_ITEMS.find(item => item.id === id && item.category === category);
        return item && owned.has(id) ? [item] : [];
    }).slice(0, cueEquipLimit(category));
}
function withEquipment(account: CueGameAccount, category: CueShopCategory, ids: string[]): CueGameAccount {
    return { ...account, equipment: { ...account.equipment, [category]: ids[0] }, equipmentSelections: { ...account.equipmentSelections, [category]: ids } };
}
export function equipCueShopItem(account: CueGameAccount, itemId: string) {
    const item = CUE_SHOP_ITEMS.find(item => item.id === itemId);
    if (!item || item.category === 'credit' || !account.purchases.some(purchase => purchase.itemId === itemId)) return account;
    const selected = cueEquippedItems(account, item.category).map(item => item.id);
    if (selected.includes(itemId)) return account;
    if (item.category === 'theme') return withEquipment(account, item.category, [itemId]);
    if (selected.length >= cueEquipLimit(item.category)) return account;
    return withEquipment(account, item.category, [...selected, itemId]);
}
export function cueEquippedValue(account: CueGameAccount, category: CueShopCategory) {
    return cueEquippedItems(account, category)[0]?.value;
}
/** One show per four fresh retrievals; rotate by show number, not rating ID. */
export function cueEffectVariant(account: CueGameAccount, completed: number): number {
    const effects = cueEquippedItems(account, 'effect');
    const show = Math.max(0, Math.floor(completed / 4) - 1);
    return effects.length ? Number(effects[show % effects.length].value) : show % 3;
}
export type CueShopAction = { kind: 'purchase' | 'purchase-equip' | 'equip' | 'unequip'; itemId: string } | { kind: 'reset'; category: CueShopCategory };
export function applyCueShopAction(account: CueGameAccount, action: CueShopAction): CueGameAccount {
    if (action.kind === 'reset') return withEquipment(account, action.category, []);
    if (action.kind === 'equip') return equipCueShopItem(account, action.itemId);
    if (action.kind === 'unequip') {
        const item = CUE_SHOP_ITEMS.find(item => item.id === action.itemId);
        return item ? withEquipment(account, item.category, cueEquippedItems(account, item.category).filter(item => item.id !== action.itemId).map(item => item.id)) : account;
    }
    const result = purchaseCueShopItem(account, action.itemId);
    if (result.error) return account;
    return action.kind === 'purchase-equip' ? equipCueShopItem(result.account, action.itemId) : result.account;
}
