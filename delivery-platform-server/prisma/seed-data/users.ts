import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import {
  resolveSeedPassword,
  shouldResetExistingSeedUserPasswords,
  type SeedPasswordKey,
} from './seed-password';

interface UserSeed {
  username: string;
  passwordKey: SeedPasswordKey;
  realName: string;
  email: string;
  phone?: string;
  roleCode: string;
}

const userDefs: UserSeed[] = [
  {
    username: 'admin',
    passwordKey: 'admin',
    realName: '系统管理员',
    email: 'admin@delivery-platform.local',
    roleCode: 'SUPER_ADMIN',
  },
  {
    username: 'delivery_mgr',
    passwordKey: 'delivery_mgr',
    realName: '张交付',
    email: 'zhangjiaofu@delivery-platform.local',
    roleCode: 'DELIVERY_MANAGER',
  },
  {
    username: 'pm_wang',
    passwordKey: 'pm',
    realName: '王经理',
    email: 'wangjl@delivery-platform.local',
    roleCode: 'PROJECT_MANAGER',
  },
  {
    username: 'pm_li',
    passwordKey: 'pm',
    realName: '李经理',
    email: 'lijl@delivery-platform.local',
    roleCode: 'PROJECT_MANAGER',
  },
  {
    username: 'elec_zhang',
    passwordKey: 'elec',
    realName: '张电气',
    email: 'zhangdq@delivery-platform.local',
    roleCode: 'ELEC_LEADER',
  },
  {
    username: 'sw_chen',
    passwordKey: 'sw',
    realName: '陈软件',
    email: 'chenrj@delivery-platform.local',
    roleCode: 'SOFTWARE_LEADER',
  },
  {
    username: 'purchase_liu',
    passwordKey: 'purchase',
    realName: '刘采购',
    email: 'liucg@delivery-platform.local',
    roleCode: 'PURCHASE',
  },
  {
    username: 'finance_zhao',
    passwordKey: 'finance',
    realName: '赵财务',
    email: 'zhaocw@delivery-platform.local',
    roleCode: 'FINANCE',
  },
  {
    username: 'standard_zhou',
    passwordKey: 'standard',
    realName: '周标准',
    email: 'zhoubz@delivery-platform.local',
    roleCode: 'STANDARD_ADMIN',
  },
  {
    username: 'partner_a',
    passwordKey: 'partner',
    realName: '外部合作方A',
    email: 'partner_a@external.local',
    roleCode: 'PARTNER',
  },
  {
    username: 'pm_zhou',
    passwordKey: 'pm',
    realName: '周敏',
    email: 'zhoumin@delivery-platform.local',
    roleCode: 'PROJECT_MANAGER',
  },
  {
    username: 'pm_sun',
    passwordKey: 'pm',
    realName: '孙凯',
    email: 'sunkai@delivery-platform.local',
    roleCode: 'PROJECT_MANAGER',
  },
  {
    username: 'pm_guo',
    passwordKey: 'pm',
    realName: '郭宁',
    email: 'guoning@delivery-platform.local',
    roleCode: 'PROJECT_MANAGER',
  },
  {
    username: 'elec_wu',
    passwordKey: 'elec',
    realName: '吴浩',
    email: 'wuhao@delivery-platform.local',
    roleCode: 'ELEC_LEADER',
  },
  {
    username: 'elec_xu',
    passwordKey: 'elec',
    realName: '徐磊',
    email: 'xulei@delivery-platform.local',
    roleCode: 'ELEC_ENGINEER',
  },
  {
    username: 'elec_he',
    passwordKey: 'elec',
    realName: '何俊',
    email: 'hejun@delivery-platform.local',
    roleCode: 'ELEC_ENGINEER',
  },
  {
    username: 'sw_yang',
    passwordKey: 'sw',
    realName: '杨晨',
    email: 'yangchen@delivery-platform.local',
    roleCode: 'SOFTWARE_LEADER',
  },
  {
    username: 'sw_lin',
    passwordKey: 'sw',
    realName: '林峰',
    email: 'linfeng@delivery-platform.local',
    roleCode: 'SOFTWARE_ENGINEER',
  },
  {
    username: 'sw_huang',
    passwordKey: 'sw',
    realName: '黄佳',
    email: 'huangjia@delivery-platform.local',
    roleCode: 'SOFTWARE_ENGINEER',
  },
  {
    username: 'purchase_tang',
    passwordKey: 'purchase',
    realName: '唐莉',
    email: 'tangli@delivery-platform.local',
    roleCode: 'PURCHASE',
  },
  {
    username: 'purchase_song',
    passwordKey: 'purchase',
    realName: '宋杰',
    email: 'songjie@delivery-platform.local',
    roleCode: 'PURCHASE',
  },
  {
    username: 'finance_zheng',
    passwordKey: 'finance',
    realName: '郑颖',
    email: 'zhengying@delivery-platform.local',
    roleCode: 'FINANCE',
  },
  {
    username: 'finance_feng',
    passwordKey: 'finance',
    realName: '冯雪',
    email: 'fengxue@delivery-platform.local',
    roleCode: 'FINANCE',
  },
  {
    username: 'hse_ma',
    passwordKey: 'standard',
    realName: '马强',
    email: 'maqiang@delivery-platform.local',
    roleCode: 'HSE',
  },
  {
    username: 'hse_luo',
    passwordKey: 'standard',
    realName: '罗婷',
    email: 'luoting@delivery-platform.local',
    roleCode: 'HSE',
  },
  {
    username: 'standard_qin',
    passwordKey: 'standard',
    realName: '秦岚',
    email: 'qinlan@delivery-platform.local',
    roleCode: 'STANDARD_ADMIN',
  },
  {
    username: 'country_chen',
    passwordKey: 'delivery_mgr',
    realName: '陈博',
    email: 'chenbo@delivery-platform.local',
    roleCode: 'COUNTRY_MANAGER',
  },
  {
    username: 'country_deng',
    passwordKey: 'delivery_mgr',
    realName: '邓宇',
    email: 'dengyu@delivery-platform.local',
    roleCode: 'COUNTRY_MANAGER',
  },
  {
    username: 'engineer_pan',
    passwordKey: 'elec',
    realName: '潘伟',
    email: 'panwei@delivery-platform.local',
    roleCode: 'ELEC_ENGINEER',
  },
  {
    username: 'engineer_cai',
    passwordKey: 'sw',
    realName: '蔡文',
    email: 'caiwen@delivery-platform.local',
    roleCode: 'SOFTWARE_ENGINEER',
  },
  {
    username: 'engineer_jiang',
    passwordKey: 'elec',
    realName: '蒋涛',
    email: 'jiangtao@delivery-platform.local',
    roleCode: 'ELEC_ENGINEER',
  },
];

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  const passwords = new Map<SeedPasswordKey, string>();
  for (const { passwordKey } of userDefs) {
    if (!passwords.has(passwordKey)) {
      passwords.set(passwordKey, resolveSeedPassword(passwordKey));
    }
  }

  const passwordFor = (passwordKey: SeedPasswordKey): string => {
    const password = passwords.get(passwordKey);
    if (!password) {
      throw new Error(`Seed password preflight failed for ${passwordKey}`);
    }
    return password;
  };

  const resetExistingPasswords = shouldResetExistingSeedUserPasswords();

  for (const user of userDefs) {
    const existingUser = await prisma.user.findUnique({
      where: { username: user.username },
    });

    let seededUser = existingUser;
    if (existingUser && resetExistingPasswords) {
      seededUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          password: await bcrypt.hash(passwordFor(user.passwordKey), 12),
        },
      });
    }

    if (!seededUser) {
      seededUser = await prisma.user.create({
        data: {
          username: user.username,
          password: await bcrypt.hash(passwordFor(user.passwordKey), 12),
          realName: user.realName,
          email: user.email,
          status: 'Active',
        },
      });
    }

    // Find the role
    const role = await prisma.role.findUnique({
      where: { roleCode: user.roleCode },
    });

    if (!role) {
      console.warn(
        `Role "${user.roleCode}" not found for user "${user.username}". Skipping role assignment.`,
      );
      continue;
    }

    // Assign role (upsert pattern by checking if user-role combo exists)
    const existingUserRole = await prisma.userRole.findUnique({
      where: {
        userId_roleId: {
          userId: seededUser.id,
          roleId: role.id,
        },
      },
    });

    if (!existingUserRole) {
      await prisma.userRole.create({
        data: {
          userId: seededUser.id,
          roleId: role.id,
          dataScope: role.defaultDataScope,
        },
      });
    }

    console.log(`User "${user.username}" seeded with role "${user.roleCode}".`);
  }
}
