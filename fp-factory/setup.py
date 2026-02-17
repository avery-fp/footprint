from setuptools import setup, find_packages

setup(
    name="fpfactory",
    version="1.0.0",
    description="Footprint Content Factory — local content automation pipeline",
    packages=find_packages(),
    python_requires=">=3.10",
    entry_points={
        "console_scripts": [
            "fpfactory=fpfactory.cli:main",
        ],
    },
)
