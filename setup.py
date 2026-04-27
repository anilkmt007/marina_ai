from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="marina_ai",
    version="0.0.1",
    description="Marina AI — Intelligent Assistant for ERPNext",
    author="anil",
    author_email="anil@gmail.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
