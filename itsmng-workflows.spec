Name:           itsm-workflows-bpmn
Version:        1.0
Release:        1%{?dist}
Summary:        ITSM NG Workflows BPMN

License:        MIT
URL:            https://github.com/itsmng/itsm-workflows-bpmn
Source0:        https://github.com/itsmng/itsm-workflows-bpmn/releases/download/%{version}/%{name}-%{version}.tgz

BuildRequires:  npm, tar, gzip
Requires:       nodejs

%define _build_id_links none
%define debug_package %{nil}

%description
ITSM NG Workflows BPMN package.

%prep
%setup -q -n %{name}

%build
# Install node modules
npm install

%install
# Crée les répertoires cibles
mkdir -p %{buildroot}/usr/share/itsmng-workflows
mkdir -p %{buildroot}/etc/itsmng-workflows

# Copie du code source
find . -mindepth 1 -maxdepth 1 ! -name 'usr' -exec cp -r {} %{buildroot}/usr/share/itsmng-workflows \;
cp %{buildroot}/usr/share/itsmng-workflows/example.env %{buildroot}/usr/share/itsmng-workflows/.env

# Copie des fichiers de configuration Debian vers /etc
cp -r debian/etc/* %{buildroot}/etc

# Nettoyage des fichiers inutiles
rm -rf %{buildroot}/usr/share/itsmng-workflows/debian \
       %{buildroot}/usr/share/itsmng-workflows/Dockerfile

%post
getent passwd itsmworkflow >/dev/null || \
    useradd -r -s /sbin/nologin -d /usr/share/itsmng-workflows itsmworkflow

[ -d /usr/share/itsmng-workflows ] && chown -R itsmworkflow:itsmworkflow /usr/share/itsmng-workflows
[ -d /etc/itsmng-workflows ] && chown -R itsmworkflow:itsmworkflow /etc/itsmng-workflows

%files
%doc README.md
/usr/share/itsmng-workflows
/etc/itsmng-workflows
/etc/systemd/system

%changelog
* Tue Nov 12 2025 AdminSys <contact@itsm-ng.com> - 1.0.0-1
- Initial RPM release for AlmaLinux 10
