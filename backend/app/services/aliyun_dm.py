"""
阿里云邮件推送(DirectMail)。跟 aliyun_sms.py 用的是同一套 AccessKey，
区别是发信地址要先在控制台建好域名并通过 SPF/DKIM 的 DNS 验证。

控制台里"发信地址"分单独的两类额度，这里走的是"批量邮件"之外的触发邮件通道
(AddressType=1)，适合验证信、通知信这种一对一的场景。
"""
from alibabacloud_dm20151123.client import Client as DmClient
from alibabacloud_dm20151123 import models as dm_models
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_tea_util import models as util_models

from app.config import (
    ALIYUN_ACCESS_KEY_ID,
    ALIYUN_ACCESS_KEY_SECRET,
    ALIYUN_DM_ACCOUNT_NAME,
    ALIYUN_DM_FROM_ALIAS,
)

_client: DmClient | None = None


def _get_client() -> DmClient:
    global _client
    if _client is None:
        config = open_api_models.Config(
            access_key_id=ALIYUN_ACCESS_KEY_ID,
            access_key_secret=ALIYUN_ACCESS_KEY_SECRET,
        )
        config.endpoint = "dm.aliyuncs.com"
        _client = DmClient(config)
    return _client


def is_configured() -> bool:
    return bool(ALIYUN_DM_ACCOUNT_NAME)


def send_email(to: str, subject: str, html: str) -> None:
    """发一封 HTML 邮件，失败抛异常，由调用方决定是给用户看错误还是记日志跳过"""
    if not is_configured():
        raise RuntimeError(
            "还没配置发信地址：在 backend/.env 里加 ALIYUN_DM_ACCOUNT_NAME="
            "你在阿里云邮件推送控制台建好的发信地址"
        )

    request = dm_models.SingleSendMailRequest(
        account_name=ALIYUN_DM_ACCOUNT_NAME,
        from_alias=ALIYUN_DM_FROM_ALIAS,
        address_type=1,
        # 我们自己维护退订(邮件底部的退订链接直接改数据库)，不走阿里云那套无效地址管理
        reply_to_address=False,
        to_address=to,
        subject=subject,
        html_body=html,
    )
    response = _get_client().single_send_mail_with_options(request, util_models.RuntimeOptions())
    # DirectMail 失败时是直接抛 TeaException 的，正常返回就代表已经进了发送队列
    # (进队列不等于对方一定收到，退信要去控制台看)
    if not response.body.env_id:
        raise RuntimeError(f"邮件发送返回异常: {response.body}")
