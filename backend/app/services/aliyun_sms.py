"""
阿里云"号码认证服务(PNVS)"里的"短信认证"能力，个人开发者用系统预置的签名/模板，
不需要自己申请签名和模板（这个跟通用的"短信服务(SMS)"产品是两回事，见调试记录）。
"""
import json

from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
from alibabacloud_dypnsapi20170525 import models as dypnsapi_models
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_tea_openapi.exceptions import ClientException
from alibabacloud_tea_util import models as util_models

from app.config import ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET

_client: DypnsapiClient | None = None


def _get_client() -> DypnsapiClient:
    global _client
    if _client is None:
        config = open_api_models.Config(
            access_key_id=ALIYUN_ACCESS_KEY_ID,
            access_key_secret=ALIYUN_ACCESS_KEY_SECRET,
        )
        config.endpoint = "dypnsapi.aliyuncs.com"
        _client = DypnsapiClient(config)
    return _client


VALID_TIME_SECONDS = 300  # 跟下面 template_param 里的 "min":"5" 保持一致（模板内容里有 ${code} 和 ${min} 两个变量）


def send_verify_code(phone: str) -> None:
    """发送验证码短信，失败时抛异常，由调用方决定怎么给用户看错误信息"""
    request = dypnsapi_models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        sign_name="恒创联众",
        template_code="100001",
        template_param=json.dumps({"code": "##code##", "min": str(VALID_TIME_SECONDS // 60)}),
        code_length=6,
        valid_time=VALID_TIME_SECONDS,
    )
    response = _get_client().send_sms_verify_code_with_options(request, util_models.RuntimeOptions())
    body = response.body
    if not body.success:
        raise RuntimeError(f"发送验证码失败: {body.code} {body.message}")


def check_verify_code(phone: str, code: str) -> bool:
    """
    校验验证码，返回是否通过。
    注意：验证码错误/过期时，SDK 不是返回 success=false，而是直接抛异常
    （跟 send_verify_code 那边的失败处理方式不一样），这里要单独接住。
    """
    request = dypnsapi_models.CheckSmsVerifyCodeRequest(
        phone_number=phone,
        verify_code=code,
    )
    try:
        response = _get_client().check_sms_verify_code_with_options(request, util_models.RuntimeOptions())
    except ClientException:
        return False

    body = response.body
    if not body.success:
        return False
    return body.model.verify_result == "PASS"
